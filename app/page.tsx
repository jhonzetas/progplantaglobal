"use client";
import { useEffect, useRef, useState, useCallback } from "react";

type Programacion = {
  version: number;
  ultimaActualizacion: string;
  columnas: string[];
  filas: (string | number | null)[][];
};
type FilaObj = Record<string, string | number | null> & { ID: string };

const COLUMNAS_VISIBLES = [
  { key: "Maquina", label: "MÁQUINA", ancho: 11 },
  { key: "OP", label: "OP", ancho: 4 },
  { key: "REF", label: "REF", ancho: 4 },
  { key: "LINEA", label: "LINEA", ancho: 3 },
  { key: "ACAB", label: "ACAB", ancho: 3 },
  { key: "COLOR", label: "COLOR", ancho: 4 },
  { key: "DESTINO", label: "DESTINO", ancho: 5 },
  { key: "NOTAS", label: "MARCA Y NOTAS\nADICIONALES", ancho: 12 },
  { key: "LAM", label: "# LAM", ancho: 3 },
  { key: "POR_PRODUCIR", label: "POR\nPRODUCIR", ancho: 4 },
  { key: "PEDIDO_CLIENTE", label: "PEDIDO\nCLIENTE", ancho: 4 },
  { key: "TIEMPO_MONTAJE", label: "TIEMPO DE\nMONTAJE", ancho: 4 },
  { key: "VELOCIDAD", label: "VELOCIDAD", ancho: 3 },
  { key: "HORAS_MAQUINADO", label: "HORAS\nMAQUINADO", ancho: 4 },
  { key: "TIEMPO_MAQUINADO", label: "TIEMPO\nMAQUINADO", ancho: 4 },
  { key: "FECHA_RODAJA", label: "FECHA\nRODAJA", ancho: 3 },
  { key: "INICIA_MAQUINADO", label: "INICIA\nMAQUINADO", ancho: 4 },
  { key: "TERMINA_MAQUINADO", label: "TERMINA\nMAQUINADO", ancho: 4 },
  { key: "FECHA_DESPACHO", label: "FECHA\nDESPACHO", ancho: 3 },
  { key: "RODAJA", label: "RODAJA", ancho: 3 },
  { key: "MONTAJE_AFUERA", label: "MONTAJE\nAFUERA", ancho: 3 },
] as const;

const COLUMNAS_FECHA = new Set([
  "FECHA_RODAJA",
  "INICIA_MAQUINADO",
  "TERMINA_MAQUINADO",
  "FECHA_DESPACHO",
]);

const MESES_ABR = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
];

const POLL_MS = 20000;

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
  return String(valor);
}

function filasAObjetos(prog: Programacion): FilaObj[] {
  return prog.filas.map((fila) => {
    const obj: any = {};
    prog.columnas.forEach((c, i) => (obj[c] = fila[i]));
    return obj as FilaObj;
  });
}

function pickPending(prev: Record<string, string>, pendientes: Set<string>) {
  const r: Record<string, string> = {};
  pendientes.forEach((id) => {
    if (prev[id]) r[id] = prev[id];
  });
  return r;
}

export default function Kiosko() {
  const [prog, setProg] = useState<Programacion | null>(null);
  const [estado, setEstado] = useState<Record<string, string>>({});
  const [conectado, setConectado] = useState(true);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const enviosPendientes = useRef<Set<string>>(new Set());

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
        setEstado((prev) => ({
          ...nuevoEstado,
          ...pickPending(prev, enviosPendientes.current),
        }));
      }
      setConectado(true);
    } catch {
      setConectado(false);
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

  async function marcar(opId: string, valor: "TR" | "TER" | "PAR") {
    setEstado((prev) => ({ ...prev, [opId]: valor }));
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

  return (
    <div className="h-screen w-screen overflow-hidden select-none bg-panel text-ink font-display flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 bg-panel-alt border-b border-panel-row-alt shrink-0">
        <div className="text-2xl font-extrabold uppercase tracking-wide">
          Programa de <span className="text-amber">Maquinado</span>
        </div>
        <div className="font-data text-xs text-ink-dim tracking-wide">
          ACTUALIZADO {prog.ultimaActualizacion} · V{prog.version}
        </div>
        <div className="flex items-center gap-3">
          {!pantallaCompleta && (
            <button
              onClick={iniciarTurno}
              className="px-3 py-1 rounded bg-signal-blue/15 border border-signal-blue text-signal-blue text-sm font-bold uppercase tracking-wide"
            >
              Iniciar turno
            </button>
          )}
          <EstadoConexion conectado={conectado} />
        </div>
      </header>

      {!conectado && (
        <div className="bg-signal-red/10 text-signal-red text-center py-1 shrink-0 font-bold uppercase tracking-wide text-sm">
          Sin conexión — mostrando última programación
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <table className="w-full border-collapse text-[11px] leading-tight table-fixed font-data">
          <colgroup>
            {COLUMNAS_VISIBLES.map((c) => (
              <col key={c.key} style={{ width: `${c.ancho}%` }} />
            ))}
            <col style={{ width: "7%" }} />
          </colgroup>
          <thead className="sticky top-0 bg-panel-alt z-10">
            <tr>
              {COLUMNAS_VISIBLES.map((c) => (
                <th
                  key={c.key}
                  className="p-1 text-left border-b border-panel-row-alt align-bottom whitespace-pre-line overflow-hidden font-display font-bold uppercase tracking-wide text-ink-dim text-[11px]"
                >
                  {c.label}
                </th>
              ))}
              <th className="p-1 border-b border-panel-row-alt font-display font-bold uppercase tracking-wide text-ink-dim text-[11px]">
                Acción
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const actual = estado[fila.ID];
              return (
                <tr
                  key={fila.ID}
                  className="border-b border-panel-row-alt odd:bg-panel-row even:bg-panel-row-alt align-top"
                >
                  {COLUMNAS_VISIBLES.map((c) =>
                    c.key === "Maquina" ? (
                      <td
                        key={c.key}
                        className="p-1 pl-2 break-words whitespace-pre-line overflow-hidden border-l-2 border-amber font-display font-bold uppercase text-amber"
                      >
                        {formatCelda(c.key, fila[c.key])}
                      </td>
                    ) : (
                      <td key={c.key} className="p-1 break-words whitespace-pre-line overflow-hidden">
                        {formatCelda(c.key, fila[c.key])}
                      </td>
                    )
                  )}
                  <td className="p-1">
                    <div className="flex flex-col gap-1">
                      <BotonEstado
                        label="TR"
                        activo={actual === "TR"}
                        color="green"
                        onClick={() => marcar(fila.ID, "TR")}
                      />
                      <BotonEstado
                        label="TER"
                        activo={actual === "TER"}
                        color="blue"
                        onClick={() => marcar(fila.ID, "TER")}
                      />
                      <BotonEstado
                        label="PAR"
                        activo={actual === "PAR"}
                        color="red"
                        onClick={() => marcar(fila.ID, "PAR")}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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

const COLORES_LAMPARA = {
  green: {
    activo: "bg-signal-green text-panel shadow-[0_0_10px_3px_rgba(51,226,122,0.65)]",
    inactivo: "bg-transparent border border-signal-green/40 text-signal-green/70",
  },
  blue: {
    activo: "bg-signal-blue text-panel shadow-[0_0_10px_3px_rgba(58,166,255,0.65)]",
    inactivo: "bg-transparent border border-signal-blue/40 text-signal-blue/70",
  },
  red: {
    activo: "bg-signal-red text-panel shadow-[0_0_10px_3px_rgba(255,77,77,0.65)]",
    inactivo: "bg-transparent border border-signal-red/40 text-signal-red/70",
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
  color: "green" | "blue" | "red";
  onClick: () => void;
}) {
  const estilos = COLORES_LAMPARA[color];
  return (
    <button
      onClick={onClick}
      className={`w-full py-1.5 rounded font-display font-extrabold text-[11px] leading-none tracking-wide transition-shadow ${
        activo ? estilos.activo : estilos.inactivo
      }`}
    >
      {label}
    </button>
  );
}
