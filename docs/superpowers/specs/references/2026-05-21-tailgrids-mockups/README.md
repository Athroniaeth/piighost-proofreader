# TailGrids mockups — brainstorm 2026-05-20/21

Static HTML mockups produced during the design brainstorm session that led to the frontend phase 1 spec (`docs/superpowers/specs/2026-05-21-frontend-tailgrids-design.md`). These are **inline-styled prototypes**, not the actual implementation — they freeze the visual decisions before code is written.

## Validated decisions

- **Layout**: vertical flow, Streamlit-clone (option A). Top bar (filename + mistake count + "Nouveau PDF") → split horizontal PDF gauche / liste fautes droite → debug accordion en bas. Container max-width 1280px, centered, 32 px lateral padding, 20 px gap.
- **État 1 (upload)**: ProofReader title centered, dropzone with 📄 icon + drag-and-drop text + "Parcourir mes fichiers" button + constraints (PDF only · 10 Mo max · text not scan), anonymisation disclaimer below, GitHub icon footer.
- **État 2 (results)**: top bar shows `<filename> · <N> fautes détectées` + "↻ Nouveau PDF" button. PDF preview left, list right. Each mistake card = colored TYPE badge (PONCTUATION red, GRAMMAIRE amber, ACCORD red, ORTHOGRAPHE red) + strikethrough error → green correction + grey description. Active mistake = amber border + `bg-amber-50` + 🎯 ACTIVE marker. Unchecked = opacity 0.6 + grey background.
- **Empty state (0 fautes)**: same layout, right pane replaced by centered check icon + "Aucune faute détectée" message.
- **File-upload primitive**: TailGrids `file-upload-1` or `file-upload-4` (minimalist dropzone). The card header from those blocks is dropped because the page-level "ProofReader" title already serves as the title.
- **Mistake list primitive**: TailGrids `notifications-3` pattern adapted (36 px colored icon + title + subtitle + unread dot equivalent for ACTIVE).

## File index

| File | What it shows |
|---|---|
| `layout.html` | Three layout options A/B/C — **option A (vertical, Streamlit-clone) was picked** |
| `state-1-detail-v3.html` | Final upload landing page |
| `state-2-detail-v2.html` | Final results page + intermediate loader |
| `error-states-v2.html` | Empty state for 0 mistakes detected |
| `tailgrids-upload.html` | 5 TailGrids file-upload variants compared |
| `tailgrids-state-2.html` | Results page reworked with embedded TailGrids primitives (badges, notifications-3 pattern, button) |
| `tailgrids-real-snaps.html` | Side-by-side of 4 real notifications-{2,3,4,5} TailGrids snapshots — **notifications-3 picked** |
| `snap-notifications-{2,3,4,5}.png` | Real headless-Firefox screenshots of TailGrids blocks (referenced by `tailgrids-real-snaps.html`) |

Open the HTML files directly in a browser — they're standalone.
