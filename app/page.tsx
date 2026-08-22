"use client";
import { useEffect, useRef, useState, useCallback } from "react";

type Programacion = {
  version: number;
  ultimaActualizacion: string;
  observaciones: string;
  columnas: string[];
  filas: (string | number | null)[][];
};
type FilaObj = Record<string, string | number | null> & { ID: string };
type Estado = "TRA" | "TER";

const COLUMNAS_VISIBLES = [
  { key: "Maquina", label: "MÁQUINA", ancho: 4 },
  { key: "OP", label: "OP", ancho: 4 },
  { key: "REF", label: "REF", ancho: 4 },
  { key: "LINEA", label: "LINEA", ancho: 3 },
  { key: "ACAB", label: "ACAB", ancho: 3 },
  { key: "COLOR", label: "COLOR", ancho: 4 },
  { key: "DESTINO", label: "DESTINO", ancho: 5 },
  { key: "NOTAS", label: "MARCA Y NOTAS\nADICIONALES", ancho: 15 },
  { key: "LAM", label: "# LAM", ancho: 3 },
  { key: "POR_PRODUCIR", label: "POR\nPRODUCIR", ancho: 5 },
  { key: "PEDIDO_CLIENTE", label: "PEDIDO\nCLIENTE", ancho: 5 },
  { key: "TIEMPO_MONTAJE", label: "TIEMPO DE\nMONTAJE", ancho: 5 },
  { key: "VELOCIDAD", label: "VELOCIDAD", ancho: 3 },
  { key: "HORAS_MAQUINADO", label: "HORAS\nMAQUINADO", ancho: 5 },
  { key: "TIEMPO_MAQUINADO", label: "TIEMPO\nMAQUINADO", ancho: 5 },
  { key: "FECHA_RODAJA", label: "FECHA\nRODAJA", ancho: 3 },
  { key: "INICIA_MAQUINADO", label: "INICIA\nMAQUINADO", ancho: 5 },
  { key: "TERMINA_MAQUINADO", label: "TERMINA\nMAQUINADO", ancho: 5 },
  { key: "FECHA_DESPACHO", label: "FECHA\nDESPACHO", ancho: 3 },
  { key: "RODAJA", label: "RODAJA", ancho: 3 },
] as const;

// Todas las columnas menos "Maquina" — esa se pinta aparte, en una sola
// celda vertical que abarca (rowSpan) todas las filas de esa máquina.
const COLUMNAS_DATOS = COLUMNAS_VISIBLES.filter((c) => c.key !== "Maquina");

const COLUMNAS_FECHA = new Set([
  "FECHA_RODAJA",
  "INICIA_MAQUINADO",
  "TERMINA_MAQUINADO",
  "FECHA_DESPACHO",
]);

// Solo estas columnas son cantidades reales; el resto (OP, REF, etc.) son
// códigos/identificadores que aunque numéricos no deben llevar separador
// de miles. Lista blanca en vez de negra para no depender de acordarse de
// excluir cada columna nueva de identificador.
const COLUMNAS_CON_FORMATO_NUMERICO = new Set([
  "LAM",
  "POR_PRODUCIR",
  "PEDIDO_CLIENTE",
  "TIEMPO_MONTAJE",
  "VELOCIDAD",
  "HORAS_MAQUINADO",
  "TIEMPO_MAQUINADO",
]);

const MESES_ABR = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
];

const POLL_MS = 20000;
const FORMATO_NUMERO = new Intl.NumberFormat("es-CO");

function formatCelda(key: string, valor: string | number | null): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (COLUMNAS_FECHA.has(key) && typeof valor === "string") {
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const [, , mes, dia] = m;
      const abr = MESES_ABR[parseInt(mes, 10) - 1] ?? mes;
      return `${parseInt(dia, 10)} ${abr}`;
    }
  }
  if (typeof valor === "number" && COLUMNAS_CON_FORMATO_NUMERICO.has(key)) {
    return FORMATO_NUMERO.format(valor);
  }
  return String(valor);
}

// Acorta el nombre de máquina para que quepa en la columna vertical, ej.
// "HPK - 3  // VARIAS LINEAS" -> "HPK3", "DMK 5 LASER" -> "DMK5 LASER"
// (conserva "LASER" en las 3 máquinas láser, ya que las distingue de los
// DMK normales).
function nombreCortoMaquina(nombre: string): string {
  const esLaser = /LASER/i.test(nombre);
  const m = nombre.match(/^([A-ZÑ]+)\s*-?\s*(\d+)/i);
  if (m) {
    const base = `${m[1].toUpperCase()}${m[2]}`;
    return esLaser ? `${base} LASER` : base;
  }
  return nombre.split(/\/\/|--/)[0].trim().replace(/\s+/g, " ");
}

function filasAObjetos(prog: Programacion): FilaObj[] {
  return prog.filas.map((fila) => {
    const obj: any = {};
    prog.columnas.forEach((c, i) => (obj[c] = fila[i]));
    return obj as FilaObj;
  });
}

// Combina lo recién sondeado del servidor con lo que hay pendiente de
// confirmar localmente (marcaciones o limpiezas con una petición aún en
// vuelo), para que un poll que llegue en medio de esa ventana no
// resucite momentáneamente un valor que el operario ya cambió.
function combinarConPendientes(
  nuevoEstado: Record<string, string>,
  prev: Record<string, string>,
  pendientes: Set<string>
): Record<string, string> {
  const combinado = { ...nuevoEstado };
  pendientes.forEach((id) => {
    if (prev[id]) combinado[id] = prev[id];
    else delete combinado[id];
  });
  return combinado;
}

// Guarda la última programación/estado conocidos en el dispositivo. Si la
// tablet se reinicia o recarga la página sin internet en ese momento, esto
// permite mostrar la última copia en vez de quedarse cargando para siempre.
const CACHE_KEY_PROG = "kiosko_cache_programacion";
const CACHE_KEY_ESTADO = "kiosko_cache_estado";

function guardarCacheLocal(prog: Programacion, estado: Record<string, string>) {
  try {
    localStorage.setItem(CACHE_KEY_PROG, JSON.stringify(prog));
    localStorage.setItem(CACHE_KEY_ESTADO, JSON.stringify(estado));
  } catch {
    // Almacenamiento no disponible (modo privado, cuota llena, etc.) — sin
    // caché local no hay nada más que hacer, la app sigue funcionando en línea.
  }
}

function leerCacheLocal(): { prog: Programacion | null; estado: Record<string, string> } {
  try {
    const progGuardado = localStorage.getItem(CACHE_KEY_PROG);
    const estadoGuardado = localStorage.getItem(CACHE_KEY_ESTADO);
    return {
      prog: progGuardado ? (JSON.parse(progGuardado) as Programacion) : null,
      estado: estadoGuardado ? JSON.parse(estadoGuardado) : {},
    };
  } catch {
    return { prog: null, estado: {} };
  }
}

// Calcula, para cada fila, si es el inicio de un grupo de máquina y cuántas
// filas consecutivas pertenecen a ese grupo (para el rowSpan).
function calcularGrupos(filas: FilaObj[]): { inicioGrupo: boolean; tamanoGrupo: number }[] {
  return filas.map((fila, idx) => {
    const inicioGrupo = idx === 0 || filas[idx - 1].Maquina !== fila.Maquina;
    if (!inicioGrupo) return { inicioGrupo: false, tamanoGrupo: 0 };
    let tamanoGrupo = 1;
    while (idx + tamanoGrupo < filas.length && filas[idx + tamanoGrupo].Maquina === fila.Maquina) {
      tamanoGrupo++;
    }
    return { inicioGrupo: true, tamanoGrupo };
  });
}

export default function Kiosko() {
  const [prog, setProg] = useState<Programacion | null>(null);
  const [estado, setEstado] = useState<Record<string, string>>({});
  const [conectado, setConectado] = useState(true);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const enviosPendientes = useRef<Set<string>>(new Set());
  // Pila de las últimas marcaciones (máx. 5) para poder deshacerlas.
  // `valorAnterior` es undefined cuando la fila no tenía ninguna marca
  // antes del cambio.
  const [historial, setHistorial] = useState<
    { id: string; valorAnterior: Estado | undefined }[]
  >([]);
  const [bitacora, setBitacora] = useState<
    { id: string; texto: string; autor: string | null; fecha: string }[]
  >([]);
  const [notaTexto, setNotaTexto] = useState("");
  const [notaAutor, setNotaAutor] = useState("");
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [editandoNotaId, setEditandoNotaId] = useState<string | null>(null);
  const [textoEdicion, setTextoEdicion] = useState("");
  const [autorEdicion, setAutorEdicion] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  // Refleja `estado` de forma síncrona (sin esperar el render de React) para
  // poder guardarlo en localStorage justo después de actualizarlo.
  const estadoRef = useRef<Record<string, string>>({});
  // Solo el primer intento de carga, si falla, recurre a la copia local
  // guardada en el dispositivo — después de eso ya hay algo en memoria y el
  // comportamiento normal (mantener lo último visto) es suficiente.
  const primerIntento = useRef(true);

  function actualizarEstado(actualizador: (prev: Record<string, string>) => Record<string, string>) {
    setEstado((prev) => {
      const siguiente = actualizador(prev);
      estadoRef.current = siguiente;
      return siguiente;
    });
  }

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/data/programacion.json?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error("sin json");
      const data: Programacion = await r.json();
      setProg((prev) => (prev && prev.version === data.version ? prev : data));

      const filas = filasAObjetos(data);
      const ids = filas.map((f) => f.ID).join(",");
      const rEstado = await fetch(`/api/estado?ids=${encodeURIComponent(ids)}`, {
        cache: "no-store",
      });
      if (rEstado.ok) {
        const nuevoEstado = await rEstado.json();
        actualizarEstado((prev) =>
          combinarConPendientes(nuevoEstado, prev, enviosPendientes.current)
        );
      }

      const rBitacora = await fetch("/api/bitacora", { cache: "no-store" });
      if (rBitacora.ok) {
        setBitacora(await rBitacora.json());
      }

      guardarCacheLocal(data, estadoRef.current);
      setConectado(true);
      primerIntento.current = false;
    } catch {
      setConectado(false);
      if (primerIntento.current) {
        const cache = leerCacheLocal();
        if (cache.prog) {
          setProg(cache.prog);
          actualizarEstado(() => cache.estado);
        }
        primerIntento.current = false;
      }
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", preventContextMenu);
    return () => document.removeEventListener("contextmenu", preventContextMenu);
  }, []);

  async function marcar(opId: string, valor: Estado, registrarHistorial = true) {
    const valorAnterior = estadoRef.current[opId] as Estado | undefined;

    // Toggle: si el operario toca de nuevo el botón que YA estaba activo,
    // la fila se limpia (equivale a "quitar el sombreado"). Antes solo se
    // podía deshacer con el botón global si la marcación era una de las
    // últimas 5 y no había pasado más actividad en el medio — reportado
    // 2026-08-22 como problema real en la tablet de planta. La acción
    // sigue registrándose en el historial para que Deshacer también
    // pueda revertir un toggle-off accidental.
    if (valorAnterior === valor) {
      if (registrarHistorial) {
        setHistorial((prev) => [...prev, { id: opId, valorAnterior }].slice(-5));
      }
      actualizarEstado((prev) => {
        const siguiente = { ...prev };
        delete siguiente[opId];
        return siguiente;
      });
      enviosPendientes.current.add(opId);
      try {
        await fetch("/api/estado", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: opId }),
        });
      } catch {
        // El estado ya quedó limpiado localmente; el próximo poll lo reconciliará.
      } finally {
        enviosPendientes.current.delete(opId);
      }
      return;
    }

    if (registrarHistorial) {
      setHistorial((prev) => [...prev, { id: opId, valorAnterior }].slice(-5));
    }
    actualizarEstado((prev) => ({ ...prev, [opId]: valor }));
    enviosPendientes.current.add(opId);
    try {
      await fetch("/api/estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: opId, estado: valor }),
      });
    } catch {
      // El estado ya quedó marcado localmente; el próximo poll exitoso lo reconciliará.
    } finally {
      enviosPendientes.current.delete(opId);
    }
  }

  async function limpiarEstado(opId: string) {
    actualizarEstado((prev) => {
      const siguiente = { ...prev };
      delete siguiente[opId];
      return siguiente;
    });
    enviosPendientes.current.add(opId);
    try {
      await fetch("/api/estado", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: opId }),
      });
    } catch {
      // El estado ya quedó limpiado localmente; el próximo poll exitoso lo reconciliará.
    } finally {
      enviosPendientes.current.delete(opId);
    }
  }

  async function borrarNota(id: string) {
    setBitacora((prev) => prev.filter((n) => n.id !== id));
    try {
      await fetch("/api/bitacora", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // La nota ya se quitó localmente; el próximo poll la restaura si el borrado no llegó a completarse.
    }
  }

  function iniciarEdicion(nota: { id: string; texto: string; autor: string | null }) {
    setEditandoNotaId(nota.id);
    setTextoEdicion(nota.texto);
    setAutorEdicion(nota.autor ?? "");
  }

  function cancelarEdicion() {
    setEditandoNotaId(null);
    setTextoEdicion("");
    setAutorEdicion("");
  }

  async function guardarEdicion(id: string) {
    const texto = textoEdicion.trim();
    if (!texto) return;
    setGuardandoEdicion(true);
    try {
      const r = await fetch("/api/bitacora", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, texto, autor: autorEdicion }),
      });
      if (r.ok) {
        const data = await r.json();
        setBitacora((prev) =>
          prev.map((n) => (n.id === id ? data.entrada : n))
        );
        setEditandoNotaId(null);
        setTextoEdicion("");
        setAutorEdicion("");
      }
    } catch {
      // Los cambios quedan en el textarea para que el operario pueda reintentar.
    } finally {
      setGuardandoEdicion(false);
    }
  }

  async function agregarNota() {
    const texto = notaTexto.trim();
    if (!texto) return;
    setEnviandoNota(true);
    try {
      const r = await fetch("/api/bitacora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto,
          autor: notaAutor.trim() || undefined,
        }),
      });
      if (r.ok) {
        const data = await r.json();
        setBitacora((prev) => [data.entrada, ...prev]);
        setNotaTexto("");
      }
    } catch {
      // El texto queda en el campo para que el operario pueda reintentar.
    } finally {
      setEnviandoNota(false);
    }
  }

  function deshacer() {
    if (historial.length === 0) return;
    const ultimo = historial[historial.length - 1];
    // El pop se hace aparte de las llamadas con efectos (limpiarEstado/marcar):
    // React 18 en modo estricto puede invocar dos veces el actualizador de
    // setState, y no queremos disparar la petición de red dos veces.
    setHistorial((prev) => prev.slice(0, -1));
    if (ultimo.valorAnterior === undefined) {
      limpiarEstado(ultimo.id);
    } else {
      marcar(ultimo.id, ultimo.valorAnterior, false);
    }
  }

  function iniciarTurno() {
    document.documentElement.requestFullscreen?.().catch(() => {});
    setPantallaCompleta(true);
  }

  if (!prog)
    return (
      <div className="h-screen w-screen bg-panel text-ink font-display flex items-center justify-center text-2xl tracking-wide">
        CARGANDO PROGRAMACIÓN…
      </div>
    );

  const filas = filasAObjetos(prog);
  const grupos = calcularGrupos(filas);

  return (
    <div className="h-screen w-screen overflow-hidden select-none bg-panel text-ink font-display flex flex-col">
      <header className="encabezado-luz flex items-center justify-between px-4 py-2 border-b-2 border-amber shrink-0 max-md:flex-wrap max-md:gap-y-1 max-md:px-2 max-md:py-1.5">
        <div className="text-2xl font-extrabold uppercase tracking-wide border-r border-r-amber/40 pr-4 max-md:text-base max-md:border-r-0 max-md:pr-0">
          <span className="text-soft-blue">Programa de</span> <span className="text-amber">Maquinado</span>
        </div>
        <div className="font-data text-xs text-soft-blue tracking-wide border-r border-r-amber/40 px-4 max-md:order-3 max-md:basis-full max-md:border-r-0 max-md:px-0">
          ACTUALIZADO {prog.ultimaActualizacion} · V{prog.version}
        </div>
        <div className="flex items-center gap-3 pl-2 max-md:gap-2 max-md:pl-0">
          <BotonDeshacer disabled={historial.length === 0} onClick={deshacer} />
          {!pantallaCompleta && (
            <button
              onClick={iniciarTurno}
              className="px-3 py-1 rounded bg-signal-blue/15 border border-signal-blue text-signal-blue text-sm font-bold uppercase tracking-wide max-md:px-2 max-md:text-xs"
            >
              Iniciar turno
            </button>
          )}
          <EstadoConexion conectado={conectado} />
        </div>
      </header>

      {(prog.observaciones ?? "").trim() !== "" && (
        <div className="shrink-0 border-b-2 border-amber bg-panel-alt px-4 py-1 max-h-[4.5rem] overflow-y-auto flex items-start gap-2 max-md:px-2">
          <span className="shrink-0 font-display font-bold uppercase tracking-wide text-amber text-xs whitespace-nowrap pt-0.5">
            OBSERVACIONES:
          </span>
          <span className="font-data text-xs text-ink whitespace-pre-line">
            {prog.observaciones ?? ""}
          </span>
        </div>
      )}

      {!conectado && (
        <div className="bg-signal-red/10 text-signal-red text-center py-1 shrink-0 font-bold uppercase tracking-wide text-sm">
          Sin conexión — mostrando última programación
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-auto">
        <table className="w-full border-collapse text-[11px] leading-tight table-fixed font-data max-md:min-w-[1100px] max-md:text-[9px]">
          <colgroup>
            {COLUMNAS_VISIBLES.map((c) => (
              <col key={c.key} style={{ width: `${c.ancho}%` }} />
            ))}
            <col style={{ width: "7%" }} />
          </colgroup>
          <thead className="encabezado-tabla-luz sticky top-0 z-10">
            <tr>
              {COLUMNAS_VISIBLES.map((c) => (
                <th
                  key={c.key}
                  className={`p-1 text-left border-b-2 border-b-amber border-r border-r-amber/20 align-bottom whitespace-pre-line overflow-hidden font-display font-bold uppercase tracking-wide text-ink-dim text-[11px] max-md:text-[9px] ${
                    c.key === "Maquina"
                      ? "max-md:sticky max-md:left-0 max-md:z-20 max-md:bg-panel-alt"
                      : ""
                  }`}
                >
                  {c.label}
                </th>
              ))}
              <th className="p-1 border-b-2 border-b-amber border-r-2 border-r-amber font-display font-bold uppercase tracking-wide text-ink-dim text-[11px]">
                Acción
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, idx) => {
              const actual = estado[fila.ID];
              const grupo = grupos[idx];
              const tinte =
                actual === "TRA"
                  ? "bg-pastel-green text-panel"
                  : actual === "TER"
                  ? "bg-pastel-red text-panel"
                  : idx % 2 === 0
                  ? "bg-panel-row"
                  : "bg-panel-row-alt";
              const divisorGrupo = grupo.inicioGrupo && idx !== 0 ? "border-t-4 border-t-amber" : "";
              const cierreTabla = idx === filas.length - 1 ? "border-b-4 border-b-amber" : "border-b border-panel-row-alt";
              return (
                <tr
                  key={fila.ID}
                  className={`align-top ${tinte} ${divisorGrupo} ${cierreTabla}`}
                >
                  {grupo.inicioGrupo && (
                    <td
                      rowSpan={grupo.tamanoGrupo}
                      className={`p-1 border-l-2 border-amber bg-panel-alt font-display font-bold uppercase text-amber text-center align-middle text-sm tracking-wide max-md:sticky max-md:left-0 max-md:z-20 max-md:text-[10px] ${divisorGrupo}`}
                      style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                    >
                      {nombreCortoMaquina(fila.Maquina as string)}
                    </td>
                  )}
                  {COLUMNAS_DATOS.map((c) => (
                    <td
                      key={c.key}
                      className="p-1 break-words whitespace-pre-line overflow-hidden border-r border-r-amber/20"
                    >
                      {c.key === "RODAJA" && fila[c.key] ? (
                        <span className="inline-block rounded bg-cyan-400 px-1.5 py-0.5 font-bold text-panel">
                          {formatCelda(c.key, fila[c.key])}
                        </span>
                      ) : (
                        formatCelda(c.key, fila[c.key])
                      )}
                    </td>
                  ))}
                  <td className="p-1 border-r-2 border-r-amber">
                    <div className="flex flex-col gap-1">
                      <BotonEstado
                        label="TRA"
                        activo={actual === "TRA"}
                        color="green"
                        onClick={() => marcar(fila.ID, "TRA")}
                      />
                      <BotonEstado
                        label="TER"
                        activo={actual === "TER"}
                        color="blue"
                        onClick={() => marcar(fila.ID, "TER")}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="border-t-4 border-amber bg-panel-alt px-4 py-3">
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-amber">
            Bitácora
          </h2>

          <div className="mb-3 flex flex-col gap-2">
            <textarea
              value={notaTexto}
              onChange={(e) => setNotaTexto(e.target.value)}
              placeholder="Escribe una novedad o solicitud del turno…"
              rows={2}
              className="w-full rounded border border-amber/40 bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-amber"
            />
            <div className="flex gap-2 max-md:flex-col">
              <input
                value={notaAutor}
                onChange={(e) => setNotaAutor(e.target.value)}
                placeholder="Tu nombre (opcional)"
                className="flex-1 rounded border border-amber/40 bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-amber"
              />
              <button
                onClick={agregarNota}
                disabled={enviandoNota || notaTexto.trim() === ""}
                className="rounded bg-amber/15 border border-amber px-4 py-1 text-xs font-bold uppercase tracking-wide text-amber disabled:opacity-40 max-md:w-full max-md:py-2"
              >
                {enviandoNota ? "Guardando…" : "Agregar nota"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {bitacora.length === 0 && (
              <p className="text-xs italic text-ink-dim">Sin notas todavía.</p>
            )}
            {bitacora.map((nota) => {
              const editando = editandoNotaId === nota.id;
              return (
                <div
                  key={nota.id}
                  className="flex items-start justify-between gap-2 border-l-2 border-amber/40 pl-2 text-xs"
                >
                  <div className="flex-1">
                    <div className="font-data text-ink-dim">
                      {new Date(nota.fecha).toLocaleString("es-CO")}
                      {nota.autor ? ` · ${nota.autor}` : ""}
                    </div>
                    {editando ? (
                      <div className="flex flex-col gap-1">
                        <input
                          value={autorEdicion}
                          onChange={(e) => setAutorEdicion(e.target.value)}
                          placeholder="Tu nombre (opcional)"
                          className="w-full rounded border border-amber/40 bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-amber"
                        />
                        <textarea
                          value={textoEdicion}
                          onChange={(e) => setTextoEdicion(e.target.value)}
                          rows={2}
                          className="w-full rounded border border-amber/40 bg-panel px-2 py-1 text-xs text-ink outline-none focus:border-amber"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => guardarEdicion(nota.id)}
                            disabled={guardandoEdicion || textoEdicion.trim() === ""}
                            className="rounded bg-amber/15 border border-amber px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber disabled:opacity-40"
                          >
                            {guardandoEdicion ? "Guardando…" : "Guardar"}
                          </button>
                          <button
                            onClick={cancelarEdicion}
                            disabled={guardandoEdicion}
                            className="rounded border border-amber/40 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-dim disabled:opacity-40"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="whitespace-pre-line text-ink">{nota.texto}</div>
                    )}
                  </div>
                  {!editando && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => iniciarEdicion(nota)}
                        aria-label="Editar nota"
                        className="rounded p-1 text-ink-dim hover:bg-amber/10 hover:text-amber"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-3.5 h-3.5"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => borrarNota(nota.id)}
                        aria-label="Borrar nota"
                        className="rounded p-1 text-ink-dim hover:bg-signal-red/10 hover:text-signal-red"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-3.5 h-3.5"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function EstadoConexion({ conectado }: { conectado: boolean }) {
  const color = conectado ? "bg-signal-green" : "bg-signal-red";
  const glow = conectado
    ? "shadow-[0_0_8px_2px_rgba(51,226,122,0.7)]"
    : "shadow-[0_0_8px_2px_rgba(255,77,77,0.7)]";
  const texto = conectado ? "text-signal-green" : "text-signal-red";
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${color} ${glow}`} />
      <span className={`text-sm font-bold uppercase tracking-wide ${texto}`}>
        {conectado ? "En línea" : "Sin conexión"}
      </span>
    </div>
  );
}

function BotonDeshacer({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="Deshacer última marcación"
      className={`w-9 h-9 rounded-full flex items-center justify-center border transition-opacity ${
        disabled
          ? "opacity-40 cursor-not-allowed border-signal-green/40 text-signal-green/40"
          : "border-signal-green bg-signal-green text-panel shadow-[0_0_10px_3px_rgba(51,226,122,0.65)]"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <polyline points="9 14 4 9 9 4" />
        <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      </svg>
    </button>
  );
}

const COLORES_LAMPARA = {
  green: {
    activo: "bg-signal-green text-panel shadow-[0_0_10px_3px_rgba(51,226,122,0.65)]",
    inactivo: "bg-transparent border border-signal-green/40 text-signal-green/70",
  },
  blue: {
    activo: "bg-signal-blue text-panel shadow-[0_0_10px_3px_rgba(58,166,255,0.65)]",
    inactivo: "bg-transparent border border-signal-blue/40 text-signal-blue/70",
  },
} as const;

function BotonEstado({
  label,
  activo,
  color,
  onClick,
}: {
  label: string;
  activo: boolean;
  color: "green" | "blue";
  onClick: () => void;
}) {
  const estilos = COLORES_LAMPARA[color];
  return (
    <button
      onClick={onClick}
      // Aria/title cambian según estado para que el operario (y lectores de
      // pantalla) sepan que tocar de nuevo el botón activo lo desmarca.
      aria-label={activo ? `${label} activo. Toca de nuevo para quitar la marca.` : `Marcar ${label}`}
      title={activo ? `Toca de nuevo para quitar la marca` : undefined}
      className={`w-full py-1.5 rounded font-display font-extrabold text-[11px] max-md:text-[9px] leading-none tracking-wide transition-shadow ${
        activo ? estilos.activo : estilos.inactivo
      }`}
    >
      <span className="inline-flex items-center justify-center gap-1">
        {label}
        {activo && <span className="text-[9px] max-md:text-[7px] opacity-70">✕</span>}
      </span>
    </button>
  );
}
