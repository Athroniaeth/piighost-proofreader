"""Build the smoke-test CV PDFs in samples/."""
from pathlib import Path

import fitz

SAMPLES = {
    "cv_fr_with_typos.pdf": [
        "Jean Dupont",
        "Email: jean.dupont@example.com",
        "Expérience profesionnelle",  # typo: profesionnelle → professionnelle
        "2022-2024 - Développeur chez Acme",
        "J'avais travailler sur des projets python.",  # conj: travailler → travaillé
    ],
    "cv_en_with_typos.pdf": [
        "John Doe",
        "Email: john.doe@example.com",
        "Profesional experience",  # typo
        "2022-2024 - Engineer at Acme",
        "I has worked on python projects.",  # conj
    ],
    "cv_es_with_typos.pdf": [
        "Juan Pérez",
        "Correo: juan@example.com",
        "Experencia profesional",  # typo: Experencia → Experiencia
        "2022-2024 - Ingeniero en Acme",
        "He trabajadoo en proyectos python.",  # ortho
    ],
}


def build() -> None:
    out_dir = Path(__file__).parent
    for name, lines in SAMPLES.items():
        doc = fitz.open()
        page = doc.new_page()
        y = 72
        for line in lines:
            page.insert_text((72, y), line, fontsize=12)
            y += 20
        doc.save(out_dir / name)
        doc.close()


if __name__ == "__main__":
    build()
