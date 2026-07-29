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

  if (!prog) return <div className="p-8 text-2xl">Cargando programación...</div>;

  const filas = filasAObjetos(prog);

  return (
    <div className="h-screen w-screen overflow-hidden select-none bg-white text-black flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-300 shrink-0">
        <div className="text-xl font-bold">PROGRAMA DE MAQUINADO</div>
        <div className="text-sm text-gray-600">
          Última actualización {prog.ultimaActualizacion} · Versión {prog.version}
        </div>
        <div className="flex items-center gap-3">
          {!pantallaCompleta && (
            <button
              onClick={iniciarTurno}
              className="px-3 py-1 rounded bg-blue-600 text-white text-sm font-semibold"
            >
              Iniciar turno
            </button>
          )}
          <div className="text-lg font-semibold">
            {conectado ? "🟢 ACTUALIZADO" : "🔴 SIN CONEXIÓN"}
          </div>
        </div>
      </header>

      {!conectado && (
        <div className="bg-orange-100 text-orange-800 text-center py-1 shrink-0">
          SIN CONEXIÓN — Mostrando última programación.
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <table className="w-full border-collapse text-[11px] leading-tight table-fixed">
          <colgroup>
            {COLUMNAS_VISIBLES.map((c) => (
              <col key={c.key} style={{ width: `${c.ancho}%` }} />
            ))}
            <col style={{ width: "7%" }} />
          </colgroup>
          <thead className="sticky top-0 bg-gray-200 z-10">
            <tr>
              {COLUMNAS_VISIBLES.map((c) => (
                <th
                  key={c.key}
                  className="p-1 text-left border-b border-gray-300 align-bottom whitespace-pre-line overflow-hidden"
                >
                  {c.label}
                </th>
              ))}
              <th className="p-1 border-b border-gray-300">ACCIÓN</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const actual = estado[fila.ID];
              return (
                <tr
                  key={fila.ID}
                  className="border-b border-gray-200 odd:bg-white even:bg-gray-50 align-top"
                >
                  {COLUMNAS_VISIBLES.map((c) => (
                    <td key={c.key} className="p-1 break-words whitespace-pre-line overflow-hidden">
                      {formatCelda(c.key, fila[c.key])}
                    </td>
                  ))}
                  <td className="p-1">
                    <div className="flex flex-col gap-1">
                      <BotonEstado
                        label="TR"
                        activo={actual === "TR"}
                        colorActivo="bg-green-500"
                        onClick={() => marcar(fila.ID, "TR")}
                      />
                      <BotonEstado
                        label="TER"
                        activo={actual === "TER"}
                        colorActivo="bg-blue-500"
                        onClick={() => marcar(fila.ID, "TER")}
                      />
                      <BotonEstado
                        label="PAR"
                        activo={actual === "PAR"}
                        colorActivo="bg-orange-500"
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

function BotonEstado({
  label,
  activo,
  colorActivo,
  onClick,
}: {
  label: string;
  activo: boolean;
  colorActivo: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full py-1.5 rounded font-bold text-white text-[11px] leading-none ${
        activo ? colorActivo : "bg-gray-300 hover:bg-gray-400"
      }`}
    >
      {label}
    </button>
  );
}
