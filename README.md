# Halftone Lens

`dodo-visual-toy` is an interactive visual toy and typographic experiment built for a Design Engineer take-home at Dodo Payments.

## Live Demo & Code
- **Live Demo**: [https://halftone-lens.netlify.app/](https://halftone-lens.netlify.app/)
- **Source Code**: [https://github.com/Mtharan93/dodo-visual-toy](https://github.com/Mtharan93/dodo-visual-toy)

---

## What I Built
Halftone Lens transforms any word or sentence into an analog halftone dot field rendered in ink on textured paper. Users can type custom text (up to 40 characters across up to four lines), which morphs cell-by-cell into the new word with smooth, staggered noise transitions. 

The pointer controls a physical lens with simulated weight and momentum:
- **Inside the Lens**: Halftone dots seamlessly morph into density-mapped ASCII typography with magnification distortion.
- **Outside the Lens**: Surrounding dots press outward against the paper with spring dynamics and shockwave ripples upon interaction.

---

## How to Play

| Interaction | Control | Effect |
| :--- | :--- | :--- |
| **Type Word** | Any printable key | Types letters into the word (first keystroke replaces default, max 40 characters, auto-wraps up to 4 lines) |
| **Delete** | <kbd>Backspace</kbd> | Removes previous character (supports key hold; empty word renders a clean blank field) |
| **New Line** | <kbd>Enter</kbd> | Adds a manual line break (up to 4 lines total) |
| **Reset** | <kbd>Escape</kbd> | Resets word to `"DODO"` |
| **Move Pointer / Touch** | Move Mouse / Drag Finger | Moves the physical lens with spring lag and velocity-aligned squash & stretch |
| **Press & Hold** | Click & Hold Pointer | Lens expands smoothly to 1.6× radius with physical suction physics |
| **Release / Click** | Release Pointer or Tap | Lens springs back and triggers a high-speed radial shockwave across the grid |
| **Switch Themes** | <kbd>Alt</kbd>+<kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> or Dock Dots | Smooth 400ms RGB theme transition (Paper, Night, Lime) |
| **Save PNG** | <kbd>Alt</kbd>+<kbd>S</kbd> or Dock Button | Exports a high-resolution PNG snapshot matching screen DPR |
| **Grid & Lens Scale** | Dock Sliders | Adjusts halftone cell size (6–24px) and base lens radius (80–220px) |
| **Mobile Keyboard** | Tap "Type anything" Hint | Opens mobile virtual keyboard via synchronized focus target |

---

## Technical & Design Choices

- **Why Raw WebGL2 over Paper Shaders / Libraries:** A single custom fragment shader with shared uniform states handles the entire pipeline—halftone grid, ASCII swap, spring physics distortion, and cell-by-cell word morphing. Writing zero-dependency WebGL2 eliminates framework overhead, enabling deterministic 60fps rendering at native retina DPR within a minimal bundle footprint.
- **Why a Critically-Damped Spring Lens:** Real physical tools have mass, inertia, and elasticity. Spring acceleration and velocity-aligned squash/stretch turn a standard cursor into an object with tactile weight.
- **Why ASCII Inside Halftone:** Both halftone screens and ASCII art share the same root mechanism: quantizing continuous tonal density into discrete symbolic marks. The lens reveals the digital substrate underneath the analog ink dot print.
- **Why Tightly Curated Themes:** Three