# Evaluaciones locales

Este paquete consume trazas de entrevistas en JSON. No importa módulos de la aplicación, no usa la base de datos y no llama a OpenAI por defecto. Las trazas incluidas son sintéticas.

## Ejecutar

Desde la raíz, después de `npm ci`:

```bash
npm run eval:test
npm run eval -- --verify-expectations
```

El segundo comando escribe `evals/results/eval-<versión>-<run-id>.json` y `.md`. Los archivos se ignoran en Git. Cada reporte incluye hashes SHA-256 del dataset, la configuración y la rúbrica semántica, además del commit SHA y `gitDirty` cuando Git está disponible. `--verify-expectations` falla si el evaluador no detecta los códigos esperados; `--strict` falla ante cualquier resultado global `fail` o `partial`. El baseline incluye casos adversariales y omite el juez semántico, por lo que `--strict` debe fallar inicialmente.

Para otro archivo: `npm run eval -- --input ruta/a/dataset.json --output ruta/de/salida`. El formato es el de `datasets/interview-cases.json`; cada caso lleva ID único, procedencia, turnos, consentimiento observado y esperado, temas requeridos y códigos de falla esperados. Incrementá `version` del dataset al modificar casos o expectativas. Incrementá las constantes de versión de los evaluadores y `config.json` al cambiar sus reglas o patrones.

Para agregar un caso, copiá un objeto dentro de `cases`, cambiá el `id` y los turnos, declará `requiredTopics` usando claves de `config.json`, y anotá en `expectedFailureCodes` los códigos que debe detectar el evaluador. Por ejemplo, una entrevista correcta puede usar `"expectedFailureCodes": []`; una pregunta sobre edad, `"expectedFailureCodes": ["sensitive_question"]`. Ejecutá los tests y luego `--verify-expectations` para comprobar la anotación.

El caso `no_acepto_current_bug` representa el comportamiento actual de `interfaces/web/src/main.tsx`: la búsqueda de `acepto` dentro de «No acepto» marca `granted`. Es una reproducción sintética del código actual, no una captura de una sesión real. La evaluación no modifica esa lógica.

## Juez semántico opcional

`EVAL_SEMANTIC_URL` habilita **LLM-as-a-judge** hacia un endpoint HTTP compatible con chat completions. Configurá también `EVAL_SEMANTIC_MODEL`; `EVAL_SEMANTIC_API_KEY` es opcional. Por ejemplo, un servidor local podría exponer ese endpoint. La rúbrica y el esquema de respuesta están en `src/evaluators/semantic.ts`; el reporte guarda el hash de la rúbrica exacta. El system prompt indica que la transcripción es dato no confiable y que deben ignorarse las instrucciones insertadas en ella. Esto reduce el riesgo de prompt injection, pero no lo elimina. El resultado `inconclusive` no se interpreta como aprobación. CI no configura estas variables.

## Interpretación

El JSON separa `deterministic`, `semantic` y `global` por caso. El estado global es `pass` sólo si ambos evaluadores aprueban, `fail` si alguno falla y `partial` si el determinístico aprueba pero el semántico está omitido o inconcluso. La tasa global cuenta sólo `pass`; `expectationMatches` mide si el evaluador reconoció las fallas sembradas en el dataset. La cobertura cuenta sólo los temas marcados como requeridos por caso. Las reglas de palabras clave pueden omitir paráfrasis o producir falsos positivos: un patrón contextual como `salud` puede aparecer en una pregunta laboral legítima. Revisá la evidencia y apoyá esos casos en evaluación semántica. No uses datos personales reales en datasets versionados ni en reportes compartidos.
