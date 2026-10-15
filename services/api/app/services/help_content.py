"""ERD-HELP-01: contenido del centro de ayuda (FAQ). Versionado en el código: cada cambio de texto sube `CONTENT_VERSION` y queda en git.

Reglas del contenido: solo describe lo que la app hace HOY (nada de funciones futuras), usa «estimado» donde el dato lo es y no promete
resultados. Los textos son párrafos simples (sin HTML ni Markdown) para que web y móvil los pinten igual y sin riesgo.
"""
from dataclasses import dataclass

CONTENT_VERSION = "2026-10-15.1"

CATEGORIES: dict[str, str] = {
    "primeros-pasos": "Primeros pasos",
    "facturas": "Facturas y lectura automática",
    "datos": "Calidad de los datos",
    "ahorro": "Ahorro y metas",
    "cuenta": "Cuenta y privacidad",
    "problemas": "Reclamaciones y problemas",
}


@dataclass(frozen=True)
class Article:
    id: str
    category: str
    title: str
    summary: str
    body: tuple[str, ...]
    tags: tuple[str, ...] = ()


ARTICLES: tuple[Article, ...] = (
    Article("registrar-primera-factura", "primeros-pasos", "¿Cómo registro mi primera factura?",
            "Puedes escribir los datos o fotografiar la factura.",
            ("Entra a Facturas y elige «Nueva factura». Puedes escribir el período, los días, los kWh y el monto, o usar «Leer factura» para fotografiarla o subir un PDF.",
             "Con una sola factura ya ves tu consumo y gasto. Con dos o más, la app compara períodos y proyecta la próxima factura.",
             "Si algún dato no coincide con tu factura, corrígelo antes de guardar: la app no inventa valores que no aparecen en el documento."),
            ("factura", "registrar", "foto", "pdf", "nueva")),
    Article("elegir-vivienda", "primeros-pasos", "¿Cómo cambio o creo otra vivienda?",
            "Cada vivienda tiene sus propias facturas, equipos y metas.",
            ("Usa el selector de vivienda en la parte de arriba (o «Mis viviendas») para cambiar de vivienda o crear otra.",
             "Los datos de una vivienda no se mezclan con los de otra. Si compartes una vivienda, solo las personas invitadas la ven."),
            ("vivienda", "casa", "cambiar", "crear")),
    Article("leer-factura-foto", "facturas", "La lectura automática de mi factura salió mal",
            "La lectura es una ayuda: siempre se revisa antes de guardar.",
            ("La app lee la foto o el PDF y te muestra un borrador. Revísalo: si un campo está vacío o dudoso, escríbelo tú. Nada se guarda como factura hasta que lo confirmas.",
             "Para mejores resultados usa buena luz, encuadra toda la factura, evita sombras y reflejos, y prefiere el PDF original cuando lo tengas.",
             "Si la lectura falla varias veces, usa «Escribir los datos a mano». La factura queda igual de válida."),
            ("ocr", "lectura", "foto", "borrador", "error")),
    Article("editar-factura", "facturas", "¿Puedo corregir una factura ya guardada?",
            "Sí, puedes editar sus datos y el detalle de cargos.",
            ("Abre la factura desde Facturas y edita los datos o el detalle de cargos. Al cambiar los kWh o el monto, los cálculos se actualizan.",
             "Si borras una factura, se borra también su detalle y el documento original asociado."),
            ("editar", "corregir", "borrar", "factura")),
    Article("real-estimado", "datos", "¿Qué significan REAL, ESTIMADO, PROYECTADO e INFERIDO?",
            "Cada cifra indica de dónde sale.",
            ("REAL: viene de un dato que tú registraste (por ejemplo, los kWh de tu factura o una lectura de tu medidor).",
             "ESTIMADO: se calcula a partir de datos tuyos con una regla (por ejemplo, el reparto por equipo o el precio medio por kWh). Es una aproximación.",
             "PROYECTADO: es lo que podría pasar si todo sigue igual (por ejemplo, la próxima factura). No es una promesa.",
             "INFERIDO: la app lo deduce de señales indirectas; úsalo solo como pista."),
            ("real", "estimado", "proyectado", "inferido", "calidad", "datos")),
    Article("por-que-estimado-equipos", "datos", "¿Por qué el consumo por equipo es estimado?",
            "La app no mide cada equipo: usa la potencia y las horas que declaras.",
            ("El consumo de cada equipo se calcula con la potencia y las horas de uso que indicas. No hay un medidor en cada aparato.",
             "Por eso el reparto por equipo siempre aparece como ESTIMADO. Cuanto más exactos sean los datos que declaras, mejor será la estimación."),
            ("equipos", "estimado", "consumo", "potencia")),
    Article("facturas-mensuales-limite", "datos", "¿Por qué no veo el consumo por hora o por día?",
            "Las facturas son mensuales.",
            ("Una factura trae el consumo de todo un período, no hora por hora. Con ella la app no puede saber en qué horas gastas más.",
             "Si registras lecturas de tu medidor, ves el consumo entre lecturas. El detalle por hora requeriría un medidor inteligente conectado, que hoy no forma parte de la app."),
            ("hora", "pico", "diario", "medidor", "lecturas")),
    Article("metas-mensuales", "ahorro", "¿Cómo funciona la meta mensual?",
            "Puedes fijar una meta de kWh, de monto o de ambos.",
            ("En Meta defines cuánto quieres consumir o gastar al mes. La app te muestra el avance del mes y si vas por buen camino.",
             "En Ahorro puedes ver una meta sugerida (tu promedio reciente menos el ahorro estimado de tus recomendaciones) y decidir si la aplicas. Es un objetivo, no una garantía."),
            ("meta", "objetivo", "ahorro", "kwh")),
    Article("recomendaciones", "ahorro", "¿De dónde salen las recomendaciones de ahorro?",
            "De reglas visibles basadas en tus equipos, facturas y meta.",
            ("Cada recomendación explica por qué se sugiere, qué supuso y cuánto podrías ahorrar. Los ahorros son estimaciones.",
             "Puedes marcarlas como aplicadas o descartarlas. Si cambias tus equipos o facturas, se recalculan."),
            ("recomendaciones", "ahorro", "estimado")),
    Article("informe-energetico", "ahorro", "¿Cómo obtengo mi informe energético?",
            "Un resumen del período que elijas, para imprimir o compartir.",
            ("En la web entra a Informes, elige el período y usa «Imprimir o guardar PDF». En el móvil abre Perfil → Informe energético y usa «Compartir informe».",
             "El informe usa tus facturas (mensuales) y marca como estimado todo lo que no es un dato tuyo directo."),
            ("informe", "pdf", "imprimir", "compartir")),
    Article("copilot", "ahorro", "¿Qué es el Energy Copilot y qué puede hacer?",
            "Un asistente que responde con los datos de tu vivienda.",
            ("El Copilot responde preguntas sobre tu consumo, tus facturas y cómo ahorrar usando solo los datos registrados de la vivienda activa, e indica la calidad de cada dato.",
             "No cambia tus datos. Puede equivocarse: revisa las fuentes que muestra. Tiene un límite diario de preguntas y puede estar desactivado en algunos entornos."),
            ("copilot", "asistente", "ia", "preguntas")),
    Article("compartir-vivienda", "cuenta", "¿Cómo comparto mi vivienda con otra persona?",
            "Invita por correo; tú decides quién la ve.",
            ("En Perfil → Compartir vivienda invita a otra persona por correo. Recibirá un enlace de un solo uso que debe abrir con la cuenta de ese correo.",
             "Puedes quitar el acceso a cualquier persona en cualquier momento."),
            ("compartir", "invitar", "familia", "acceso")),
    Article("exportar-borrar-datos", "cuenta", "¿Puedo descargar o borrar mis datos?",
            "Sí, desde los ajustes de tu cuenta.",
            ("En Ajustes de cuenta puedes descargar una copia de tus datos y también eliminar tu cuenta. Al eliminarla se borran tus viviendas propias y sus datos.",
             "Los documentos originales de tus facturas se guardan cifrados y se borran junto con la factura o la cuenta."),
            ("privacidad", "exportar", "borrar", "cuenta", "datos")),
    Article("olvide-contrasena", "cuenta", "Olvidé mi contraseña",
            "Puedes restablecerla con tu correo.",
            ("En la pantalla de acceso elige «Olvidé mi contraseña» e ingresa tu correo. Si existe una cuenta, recibirás un enlace de un solo uso para crear una nueva.",
             "Por seguridad, la respuesta es la misma exista o no la cuenta."),
            ("contraseña", "recuperar", "acceso", "correo")),
    Article("reclamar-distribuidora", "problemas", "Creo que mi factura tiene un error. ¿Qué hago?",
            "Puedes preparar un caso con tus datos para llevarlo a la distribuidora.",
            ("En Reclamaciones puedes crear un caso ligado a una factura: la app guarda un resumen con el consumo, el monto y la comparación con la factura anterior, y lleva el seguimiento.",
             "La comparación es un apoyo para ti: no demuestra por sí sola un error de la distribuidora ni la acusa de nada. La reclamación formal la presentas tú ante tu distribuidora y guardas aquí el número de referencia.",
             "Aquí también puedes añadir notas y cerrar el caso cuando se resuelva."),
            ("reclamo", "reclamación", "error", "distribuidora", "factura")),
    Article("apagones", "problemas", "¿Cómo registro un apagón?",
            "Se registra a mano con inicio, fin y observaciones.",
            ("En Apagones agrega la fecha y hora de inicio y fin. La app no detecta apagones automáticamente: solo muestra los que registras.",),
            ("apagón", "interrupción", "luz")),
)

_BY_ID = {a.id: a for a in ARTICLES}


def get_article(article_id: str) -> Article | None:
    return _BY_ID.get(article_id)
