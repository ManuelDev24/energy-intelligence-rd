# ERD-WEB-LEGAL-PUBLISH — publicación de términos y privacidad (estado)

Estado: **parcial — la parte técnica está hecha; publicar el texto final depende de una aprobación legal que no se puede dar desde el código.**

## Hecho y verificado
| Requisito del paquete | Estado | Evidencia |
|---|---|---|
| «Bloquear producción mientras el documento siga en borrador» | ✅ desde la re-auditoría C-04 | `services/legal.py::require_final_legal` se ejecuta al arrancar (`main.py`); `tests/test_config.py` cubre producción sin y con `ALLOW_DRAFT_LEGAL`, staging y desarrollo |
| La aceptación del riesgo no puede ocultarse en la configuración del repositorio | ✅ | `infrastructure/deploy/check_deploy_config.py` rechaza `ALLOW_DRAFT_LEGAL` en `render.yaml` |
| Versión de los documentos aceptada por cada persona | ✅ | `users.terms_version` / `terms_accepted_at` (migración 0012) |
| El estado legal es visible para operaciones | ✅ nuevo | `/sistema` muestra «Términos y política de privacidad»: **Bien** solo con textos finales; **Atención** si son borrador (o si el riesgo se aceptó con `ALLOW_DRAFT_LEGAL`); **Falta** si producción sirviera en borrador sin aceptarlo. `test_legal_texts_in_draft_are_never_reported_as_ok` |
| La web dice que el texto es un borrador | ✅ | `apps/web/src/app/legal/page.tsx` («Documento en BORRADOR, pendiente de revisión legal») |

## Pendiente — necesita a la persona responsable (no es trabajo de código)
1. **Texto aprobado** de términos y de privacidad (hoy `docs/legal/*_DRAFT.md`), revisado según la Ley 172-13 RD.
2. **Responsable del tratamiento y canal ARCO** (acceso, rectificación, cancelación, oposición): nombre, correo y plazo de respuesta.
3. **Retención** definitiva por tipo de dato (`docs/legal/PRIVACY_AND_RETENTION_DRAFT.md` es solo un borrador).
4. **Proveedores** que tratan datos (correo, almacenamiento, Copilot/Anthropic, Sentry) con su finalidad y país.
5. **Contacto** legal y fecha de entrada en vigor.

## Qué haré cuando llegue el texto aprobado
- Sustituir los borradores y la leyenda «BORRADOR» de la web, cambiar `LEGAL_STATUS` a `final` y subir las versiones (`LEGAL_TERMS_VERSION` / `LEGAL_PRIVACY_VERSION`); las personas que aceptaron la versión anterior deberán aceptar la nueva.
- Añadir el **historial de versiones** visible en `/legal` (qué cambió y desde cuándo) con los textos aprobados.
- Retirar la nota de riesgo de `/sistema` (se pondrá en «Bien» sola).

> No se debe cambiar `LEGAL_STATUS` a `final` sin esa aprobación: sería declarar revisado un texto que no lo está.
