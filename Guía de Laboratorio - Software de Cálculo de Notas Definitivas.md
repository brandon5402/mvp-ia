UÍA DE LABORATORIO TÉCNICO 

# Software de Cálculo de Notas Definitivas 

Arquitectura en capa gratuita: HTML5, CSS3, JavaScript Vanilla, IndexedDB y despliegue en Vercel 

Esta arquitectura (HTML5, CSS3, JS Vanilla, IndexedDB y Vercel) resulta idónea para este laboratorio por una razón técnica fundamental: elimina la fricción de infraestructura —sin servidores, sin configuraciones de CORS ni límites de créditos en bases de datos en la nube— y lleva al aprendiz a dominar fundamentos reales como la manipulación del DOM, el asincronismo en bases de datos locales (IndexedDB frente a la limitación síncrona de localStorage ) y el despliegue continuo en capa gratuita. 

## 1. Insumo Principal: Caso de Uso 

El siguiente caso de uso sirve como documento base para que los aprendices elaboren las Épicas, Historias de Usuario (HU), Especificaciones Técnicas (Specs) y Criterios de Aceptación del sistema. 

|Campo|Descripción|
|---|---|
|Nombre del Caso de Uso|CU-01 Gestión y Cálculo de Nota Definitiva|
|Actor Principal|Estudiante|
|Objetivo|Permitir al estudiante autenticarse únicamente con<br>su documento de identidad, configurar una<br>estructura de evaluación personalizada y conocer<br>su nota definitiva y estado académico.|
|Precondiciones|El usuario accede a la aplicación web desde un<br>navegador moderno con soporte para IndexedDB.|



### Reglas de Negocio (RN) 

- RN-01: El acceso es exclusivo mediante número de documento (sin contraseña). Si no existe en la base de datos local, se registra automáticamente o mediante un flujo rápido de registro; si existe, inicia sesión. 

- RN-02: La escala de calificación es de 0.0 a 5.0 . 

- RN-03: La sumatoria de los porcentajes de todas las notas debe ser exactamente igual al 100%. 

- RN-04: Se aprueba la asignatura con una nota definitiva mayor o igual a 3.0 . 

Guía de Laboratorio — Software de Cálculo de Notas Definitivas 

Page 1 of 4 

### Flujo Principal 

1. El estudiante ingresa su número de documento en la pantalla de acceso. 

2. El sistema valida el documento en IndexedDB, crea o recupera la sesión local y redirige al panel de notas. 

3. El estudiante ingresa la cantidad de notas a evaluar (por ejemplo: 3). 

4. El sistema genera dinámicamente los campos correspondientes para ingresar, por cada nota, su valor y su porcentaje. 

5. El estudiante diligencia los valores y porcentajes, y ejecuta el cálculo. 

6. El sistema valida los datos, calcula el promedio ponderado y muestra la nota definitiva junto con el estado (Aprobado o Reprobado). 

7. El sistema guarda el historial del cálculo asociado al documento del estudiante en IndexedDB. 

### Flujos Alternos (Excepciones) 

- FA-01 (Porcentaje inválido): Si la suma de porcentajes es menor o mayor al 100%, el sistema bloquea el cálculo y muestra una alerta indicando el porcentaje faltante o sobrante. 

- FA-02 (Nota fuera de rango): Si una nota es menor a 0.0 o mayor a 5.0 , el sistema resalta el campo y solicita corrección. 

- FA-03 (Campos vacíos o no numéricos): El sistema impide avanzar hasta completar los datos requeridos. 

## 2. ¿Qué son las Specs (Especificaciones Técnicas)? 

Para orientar el trabajo de los aprendices, resulta clave establecer una distinción práctica: la Historia de Usuario (HU) define el qué y el para qué desde el negocio; la Spec define el cómo exacto desde la ingeniería antes de escribir una sola línea de código. 

Una especificación técnica completa para este proyecto debe responder a cuatro aspectos concretos: 

- Modelo de datos: Nombre de la base de datos en IndexedDB, nombre de cada ObjectStore (por ejemplo, usuarios y calculos ), llave primaria ( keyPath: "documento" ) y tipos de datos de cada propiedad. 

- Contrato de UI y estados: Qué elementos del DOM se muestran u ocultan en cada etapa del flujo (estado de acceso, estado de configuración de cantidad de notas y estado de resultados). 

- Fórmula y validaciones: Cómo se calcula exactamente el promedio ponderado mediante ∑ (notai × porcentajei / 100) y cómo se manejan los decimales (por ejemplo, redondeo a dos cifras). 

- Casos borde (Edge cases): Comportamiento esperado si el usuario recarga la página (persistencia de sesión) o si intenta ingresar cero notas o valores negativos. 

Guía de Laboratorio — Software de Cálculo de Notas Definitivas 

Page 2 of 4 

Argumento pedagógico: Enseñar a escribir Specs evita que los aprendices soliciten código genérico a la inteligencia artificial. Las Specs actúan como las restricciones exactas que garantizan calidad y coherencia arquitectónica en el desarrollo asistido por IA. 

## 3. Prompt Maestro para los Aprendices 

Los aprendices deben copiar la siguiente plantilla en su herramienta de IA, reemplazando la sección final con las Historias de Usuario, Specs y Criterios de Aceptación que ellos mismos redactaron. El prompt incluye control de avance (gatekeeping) para impedir que la IA entregue el <u>proyecto resuelto de una sola vez.</u> 

Actúa como un Arquitecto de Software Senior y Mentor Técnico. Vamos a construir una aplicación web de cálculo de notas definitivas de forma controlada, paso a paso. 

### Restricciones Técnicas (Obligatorias) 

- Stack: HTML5, CSS3, JavaScript Vanilla (ES6+ modular). Sin frameworks ni librerías externas. 

- Persistencia: IndexedDB nativa del navegador (no usar localStorage para los datos principales). 

- Despliegue objetivo: Vercel (archivos estáticos). 

### Reglas de Interacción (Estrictas) 

1. PROHIBIDO entregar todo el código del proyecto en una sola respuesta. 

2. Trabajaremos estrictamente en 6 fases secuenciales: 

- Fase 1: Arquitectura de carpetas y estructura base HTML/CSS. 

- Fase 2: Configuración y conexión a IndexedDB (creación de ObjectStores). - Fase 3: Lógica de registro e inicio de sesión solo con documento de identidad. 

- Fase 4: Generación dinámica de inputs (cantidad de notas y porcentajes) con validaciones en tiempo real. 

- Fase 5: Cálculo del promedio ponderado, resultado (gana/pierde) y guardado en IndexedDB. 

- Fase 6: Preparación y verificación para despliegue en Vercel. 

3. En cada fase debes: 

- Explicar primero el *porqué* técnico de lo que vamos a construir. 

- Entregar únicamente el código correspondiente a esa fase, bien comentado. - Hacerme una pregunta de verificación rápida sobre el código entregado para asegurar que lo entendí. 

4. NO avances a la siguiente fase hasta que yo responda tu pregunta y te diga explícitamente "Continuar". 

### Mis Especificaciones (Specs) [AQUÍ EL APRENDIZ PEGA SUS HU, SPECS Y CRITERIOS DE ACEPTACIÓN] 

Confirma que entendiste las reglas y comencemos únicamente con la Fase 1. 

Guía de Laboratorio — Software de Cálculo de Notas Definitivas 

Page 3 of 4 

## 4. Estructura de un Prompt Técnico Controlado 

Para que un prompt técnico funcione como instrumento de aprendizaje y no como un generador pasivo de código, debe incorporar los siguientes seis componentes estructurales: 

|Paso|Componente|Argumento Técnico / Pedagógico|
|---|---|---|
|1|Rol y Nivel de Exigencia|Definir el perfil de "Arquitecto y Mentor" orienta el tono de la IA hacia<br>las buenas prácticas y la explicación fundamentada, por encima de<br>soluciones rápidas.|
|2|Restricciones de Stack<br>(Guardrails)|Sin límites explícitos, la IA suele introducir React, Tailwind o<br>localStoragepor defecto. Delimitar el stack garantiza el<br>cumplimiento de la arquitectura definida.|
|3|División en Fases<br>(Chunking)|Segmentar el desarrollo en hitos pequeños reduce errores de la IA y<br>permite depurar cada capa de forma aislada (por ejemplo, validar<br>IndexedDB antes de manipular el DOM).|
|4|Bloqueo de Avance<br>(Gatekeeping)|La regla de no avanzar hasta recibir la instrucción "Continuar"<br>devuelve el control del ritmo al aprendiz y evita que reciba bloques<br>extensos de código sin comprenderlos.|
|5|Validación Activa|Exigir una pregunta técnica al cierre de cada fase transforma al<br>estudiante de consumidor pasivo a desarrollador activo que verifica su<br>propio aprendizaje.|
|6|Inyección de Specs<br>Propias|Asegura que el insumo del prompt sea el trabajo previo de ingeniería<br>de requisitos del aprendiz. Si la Spec presenta vacíos, el código<br>reflejará la falla y brindará retroalimentación inmediata.|



Guía de Laboratorio — Software de Cálculo de Notas Definitivas 

Page 4 of 4 

