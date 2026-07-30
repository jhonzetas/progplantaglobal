# Despliegue — Kiosko Producción

## 1. Subir el código a GitHub

git remote ya está configurado hacia `https://github.com/jhonzetas/progplantaglobal.git`.

```bash
git push -u origin main
```

Si pide usuario/contraseña de forma interactiva, configura primero Git Credential
Manager o una llave SSH — el macro del Excel depende de que este paso no requiera
login manual.

## 2. Crear el proyecto en Vercel

1. Entra a https://vercel.com y conecta tu cuenta de GitHub si no lo has hecho.
2. "Add New..." → "Project" → selecciona el repo `jhonzetas/progplantaglobal`.
3. Vercel detecta Next.js automáticamente — no cambies nada en "Build & Output Settings".
4. Click "Deploy". El primer deploy tardará 1-2 minutos.
5. Si quieres que el dominio sea `progplantaglobal.vercel.app`, ve a
   Project Settings → General → Project Name y ajústalo antes o después del primer deploy
   (el dominio `<project-name>.vercel.app` sigue el nombre del proyecto).

## 3. Conectar Upstash Redis

1. En el proyecto de Vercel, pestaña **Storage** → "Create Database" → **Upstash Redis**
   (plan Free, sin tarjeta).
2. Conéctala al proyecto cuando lo pida.
3. Ve a Project Settings → Environment Variables y confirma qué nombres quedaron creados:
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` (heredado) o `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`. `lib/redis.ts` ya intenta ambos nombres, así que no
   necesitas renombrarlas.
4. Ve a Deployments → el último deploy → menú "..." → **Redeploy** (las variables de
   entorno solo se aplican en el próximo build, no en el actual).

## 4. Verificar en la nube

1. Abre `https://<tu-proyecto>.vercel.app` en un navegador de escritorio.
2. Confirma que la tabla carga con los datos reales.
3. Toca `TR` en una fila, refresca la página, confirma que el estado se mantuvo
   (esto prueba que Upstash está conectado correctamente).

## 5. Configurar la tablet

1. Abre la URL de Vercel en el navegador de la tablet.
2. Toca "Iniciar turno" para entrar en pantalla completa, o configura el navegador
   kiosko del dispositivo (ej. Fully Kiosk Browser) para abrir esa URL directamente
   en modo kiosko a nivel de sistema.

## 6. Prerrequisito para el macro de Excel

En una terminal, en `C:\progplantaglobal.vercel.app`, confirma que `git push origin main`
funciona sin pedir usuario/clave. Si pide login, el macro se queda colgado esperando —
configura Git Credential Manager o SSH antes de usarlo en producción.

## 7. Pendientes de verificación manual (no confirmados automáticamente)

- Tap real de TR/TER/PAR en un navegador (la verificación automatizada en este
  entorno quedó bloqueada por un problema del propio tooling de browser automation,
  no del código). Confirmar antes de dar el turno de mañana por listo.
- Compilar y ejecutar `macro/ExportarProgramacionJSON.bas` dentro de Excel — no se
  puede ejecutar VBA desde esta terminal. Confirmar que el JSON exportado abre bien
  y que los caracteres con tilde/Ñ no se corrompen.
test webhook ju., 30 de jul. de 2026  8:28:55
