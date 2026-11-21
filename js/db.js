/**
 * db.js — Capa de acceso a datos (IndexedDB nativa). Fase 2.
 *
 * Responsabilidad ÚNICA: guardar y leer datos. Este módulo no sabe nada del DOM
 * ni de las reglas de negocio (por ejemplo, el formato del documento lo valida
 * auth.js en la Fase 3). Aquí solo protegemos la integridad de la llave.
 *
 * IndexedDB trabaja con eventos (onsuccess/onerror). Para usarla con
 * async/await, envolvemos cada IDBRequest e IDBTransaction en una Promesa.
 *
 * Esquema (specs §2.1):
 *   notasDB v1
 *   ├── usuarios  { keyPath: "documento" }
 *   └── calculos  { keyPath: "id", autoIncrement: true }
 *         └── índice "porDocumento" sobre "documento" (unique: false)
 */

const NOMBRE_DB = 'notasDB';
const VERSION_DB = 1;

const STORE_USUARIOS = 'usuarios';
const STORE_CALCULOS = 'calculos';
const INDICE_POR_DOCUMENTO = 'porDocumento';

/** Mensaje exacto de los specs para EC-13. */
export const MENSAJE_SIN_ALMACENAMIENTO =
  'Tu navegador no permite el almacenamiento local necesario.';

/**
 * Error propio para distinguir "IndexedDB no está disponible" (EC-13) de
 * otros errores. `cause` conserva el error original para depurar.
 */
export class ErrorAlmacenamiento extends Error {
  constructor(causa) {
    super(MENSAJE_SIN_ALMACENAMIENTO, { cause: causa });
    this.name = 'ErrorAlmacenamiento';
  }
}

/* --------------------------------------------------------------------------
   Utilidades internas: de eventos a Promesas
   -------------------------------------------------------------------------- */

/** Resuelve con request.result o rechaza con request.error. */
function promesaDeRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Resuelve cuando la transacción hace COMMIT. Para escrituras esto es lo que
 * importa: que un `add` dé onsuccess no garantiza que quedó guardado; la
 * transacción aún puede abortarse (por ejemplo, por cuota llena).
 */
function promesaDeTransaccion(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new DOMException('La transacción fue abortada.', 'AbortError'));
  });
}

/**
 * Protege la llave primaria: el documento SIEMPRE debe ser string (EC-11).
 * Si llegara un número, "00123" se convertiría en 123 y sería otro usuario.
 */
function exigirDocumentoString(documento) {
  if (typeof documento !== 'string' || documento.length === 0) {
    throw new TypeError('El documento debe ser un string no vacío.');
  }
}

/* --------------------------------------------------------------------------
   Conexión
   -------------------------------------------------------------------------- */

/**
 * Guardamos la PROMESA de conexión (no solo la conexión). Así, si varias
 * funciones llaman a abrirDB() al mismo tiempo, todas esperan la misma
 * apertura en vez de abrir varias conexiones.
 * @type {Promise<IDBDatabase> | null}
 */
let promesaConexion = null;

/**
 * Abre (o crea) notasDB. Los stores y el índice se crean en onupgradeneeded,
 * el ÚNICO momento en que IndexedDB permite cambiar el esquema.
 * @returns {Promise<IDBDatabase>}
 */
export function abrirDB() {
  if (promesaConexion) return promesaConexion;

  promesaConexion = new Promise((resolve, reject) => {
    // EC-13: navegadores o contextos sin IndexedDB.
    if (!globalThis.indexedDB) {
      reject(new ErrorAlmacenamiento(new Error('indexedDB no existe en este contexto.')));
      return;
    }

    let solicitud;
    try {
      solicitud = indexedDB.open(NOMBRE_DB, VERSION_DB);
    } catch (error) {
      // Algunos contextos restringidos lanzan SecurityError al llamar open().
      reject(new ErrorAlmacenamiento(error));
      return;
    }

    // Se dispara si la BD no existe o si VERSION_DB es mayor que la guardada.
    solicitud.onupgradeneeded = (evento) => {
      const db = solicitud.result;

      // Migraciones por versión: si mañana creamos la v2, añadiremos
      // `if (evento.oldVersion < 2) { ... }` debajo, sin tocar este bloque.
      if (evento.oldVersion < 1) {
        // Sin autoIncrement: la llave es el propio documento.
        db.createObjectStore(STORE_USUARIOS, { keyPath: 'documento' });

        const calculos = db.createObjectStore(STORE_CALCULOS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        // El índice permite buscar "todos los cálculos de un documento"
        // sin recorrer la tabla completa (EC-16).
        calculos.createIndex(INDICE_POR_DOCUMENTO, 'documento', { unique: false });
      }
    };

    solicitud.onsuccess = () => {
      const db = solicitud.result;

      // Si otra pestaña necesita actualizar el esquema (o borrar la BD),
      // cerramos nuestra conexión para no bloquearla. La próxima llamada a
      // abrirDB() abrirá una conexión nueva.
      db.onversionchange = () => {
        db.close();
        promesaConexion = null;
      };
      // El navegador puede cerrar la conexión por su cuenta (p. ej. al borrar
      // datos del sitio desde la configuración).
      db.onclose = () => {
        promesaConexion = null;
      };

      resolve(db);
    };

    // Modo privado de algunos navegadores, almacenamiento bloqueado, etc.
    solicitud.onerror = () => reject(new ErrorAlmacenamiento(solicitud.error));
  });

  // Si la apertura falla, olvidamos la promesa para permitir reintentar.
  promesaConexion.catch(() => {
    promesaConexion = null;
  });

  return promesaConexion;
}

/* --------------------------------------------------------------------------
   Usuarios
   -------------------------------------------------------------------------- */

/**
 * @param {string} documento
 * @returns {Promise<{documento: string, fechaRegistro: string, ultimoAcceso: string} | undefined>}
 */
export async function obtenerUsuario(documento) {
  exigirDocumentoString(documento);
  const db = await abrirDB();
  const tx = db.transaction(STORE_USUARIOS, 'readonly');
  // get() devuelve undefined si la llave no existe (no es un error).
  return promesaDeRequest(tx.objectStore(STORE_USUARIOS).get(documento));
}

/**
 * Inserta un usuario nuevo. Usa add() y NO put():
 *   - add() falla con ConstraintError si el documento ya existe;
 *   - put() lo sobrescribiría en silencio y perderíamos fechaRegistro.
 * Esa falla es una red de seguridad contra registros duplicados (EC-12).
 * @param {string} documento
 */
export async function crearUsuario(documento) {
  exigirDocumentoString(documento);
  const ahora = new Date().toISOString();
  const usuario = { documento, fechaRegistro: ahora, ultimoAcceso: ahora };

  const db = await abrirDB();
  const tx = db.transaction(STORE_USUARIOS, 'readwrite');
  // Promise.all espera la petición Y el commit, y maneja el rechazo de ambas.
  await Promise.all([
    promesaDeRequest(tx.objectStore(STORE_USUARIOS).add(usuario)),
    promesaDeTransaccion(tx),
  ]);
  return usuario;
}

/**
 * Actualiza ultimoAcceso. Leer y escribir ocurren en la MISMA transacción
 * para que nadie modifique el registro entre ambos pasos.
 * Devuelve el usuario actualizado, o undefined si no existe.
 * @param {string} documento
 */
export async function actualizarAcceso(documento) {
  exigirDocumentoString(documento);
  const db = await abrirDB();
  const tx = db.transaction(STORE_USUARIOS, 'readwrite');
  const store = tx.objectStore(STORE_USUARIOS);
  const commit = promesaDeTransaccion(tx);

  let usuarioActualizado;
  const lectura = store.get(documento);
  // Usamos el callback (no `await`) para encadenar la escritura dentro del
  // mismo ciclo de la transacción y que no se cierre entre get() y put().
  lectura.onsuccess = () => {
    const usuario = lectura.result;
    if (!usuario) return; // nada que actualizar; la transacción termina sola
    usuarioActualizado = { ...usuario, ultimoAcceso: new Date().toISOString() };
    store.put(usuarioActualizado); // put(): aquí SÍ queremos reemplazar
  };

  await commit;
  return usuarioActualizado;
}

/* --------------------------------------------------------------------------
   Cálculos
   -------------------------------------------------------------------------- */

/**
 * Inserta un cálculo y devuelve el id autogenerado.
 * @param {{documento: string, fecha?: string, notas: Array<{valor: number, porcentaje: number}>,
 *          definitiva: number, estado: 'Aprobado' | 'Reprobado'}} calculo
 * @returns {Promise<number>}
 */
export async function guardarCalculo(calculo) {
  exigirDocumentoString(calculo?.documento);

  // Copia para no modificar el objeto del llamador. Quitamos `id` por si
  // viniera: debe asignarlo IndexedDB (autoIncrement).
  const { id: _ignorado, ...datos } = calculo;
  const registro = { ...datos, fecha: datos.fecha ?? new Date().toISOString() };

  const db = await abrirDB();
  const tx = db.transaction(STORE_CALCULOS, 'readwrite');
  const [idNuevo] = await Promise.all([
    promesaDeRequest(tx.objectStore(STORE_CALCULOS).add(registro)),
    promesaDeTransaccion(tx), // si falla por cuota, rechaza aquí (EC-14)
  ]);
  return idNuevo;
}

/**
 * Cálculos de UN documento, del más reciente al más antiguo.
 * getAll() sobre el índice filtra por documento (EC-16) y, para una misma
 * llave de índice, devuelve en orden de llave primaria (id ascendente).
 * Como el id es autoincremental, invertir el arreglo = más reciente primero.
 * @param {string} documento
 */
export async function listarCalculos(documento) {
  exigirDocumentoString(documento);
  const db = await abrirDB();
  const tx = db.transaction(STORE_CALCULOS, 'readonly');
  const indice = tx.objectStore(STORE_CALCULOS).index(INDICE_POR_DOCUMENTO);
  const calculos = await promesaDeRequest(indice.getAll(documento));
  return calculos.reverse();
}
