# Noblesse Studio — Calendar design spec

- Status: implementation reference
- Date: 2026-08-21
- Primary concept: `noblesse-studio-calendar-week-day-concept-v01.png`
- Editor concept: `noblesse-studio-calendar-editor-concept-v01.png`

## Product anatomy

- Keep the existing 226 px Noblesse Studio sidebar and mark `Calendrier` selected.
- The desktop default is a full six-row month, Monday to Sunday, followed by the inline expanded selected day. A `Mois / Semaine` switch preserves the detailed week strip without removing it.
- Month cells show real item counts, timed-item previews and continuous all-day/multi-day bars split only at week boundaries. Adjacent-month days stay visible and selectable.
- Timed items live on a 00:00–24:00 vertical canvas. All-day and multi-day items live in a dedicated rail above it.
- Creation and editing use a modal/drawer. The editor is the only modal surface in the core workflow.
- `À venir` is a compact agenda companion and the accessible/mobile fallback for dense time-grid content.

## Visual system

- Background: existing `--navy-0` / `--navy-1` black-quartz shell.
- Surface: `rgba(5,15,25,.82)` with `--line` borders; radius 8–10 px.
- Selection and focus: `--blue` / `--blue-soft`; focus is never represented by color alone.
- Project accent: PrimeBot blue, Prime Industry gold, How Many Boxes cyan, Studio neutral silver.
- Red is reserved for the current-time rule, overdue items, destructive actions, and genuine urgency.
- Controls use the existing Inter / Segoe UI stack with explicit 9–14 px chrome styles and 44 px primary targets.
- Icons use the existing Lucide outline family at 1.7–1.9 stroke width.

## Allowed primary-screen copy

`Calendrier`, `Aujourd’hui`, current period label, `Mois`, `Semaine`, `Nouvel événement`, weekdays `LUN` through `DIM`, month navigation help, `Toute la journée`, selected-day heading, `À venir`, `Aucun élément`, project names, event titles and their real metadata.

## Allowed editor copy

`Nouvel événement`, `Modifier l’élément`, `Rendez-vous`, `Tâche`, `Deadline`, `Bloc de travail`, `Titre`, `Projet`, `Début`, `Fin`, `Toute la journée`, `Récurrence`, `Fuseau horaire`, `Lieu ou lien`, `Notes`, `Rappels`, `Notification ordinateur`, `E-mail — connexion requise`, `Ajouter un rappel`, `Annuler`, `Enregistrer`, `Supprimer`.

## Interaction and accessibility

- Month and week dates are real buttons with a visible selected state and a textual count label.
- Arrow Left/Right moves one day in the month; Arrow Up/Down moves one week; Home/End moves to the first/last day of the row.
- Arrow Left/Right moves the selected day; Home/End moves to the beginning/end of the week; `T` returns to today; `Ctrl/Cmd+N` opens creation; Escape closes the editor.
- Every drag-style calendar action must retain a button/form alternative. Initial release prioritizes exact click/form editing over drag-only behavior.
- The editor traps focus, restores it to the trigger, closes on Escape and uses `role="dialog"` / `aria-modal="true"`.
- Mobile keeps the seven-column month/weekly surface inside its own horizontal scroll container, without creating horizontal page overflow, then shows the selected day and agenda.

## Data-driven deviations from the concepts

- Dates, counts, current time and items always come from the real local calendar; the concept’s May 2025 examples are never shipped as seed data.
- E-mail is visibly unavailable until a real provider, verified sender, consent and secret storage are configured.
- Desktop reminders expose an explicit activation/test state; no permission is requested on app launch.
