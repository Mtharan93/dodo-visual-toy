# Halftone Lens

`dodo-visual-toy` is an interactive visual toy and typographic experiment built for a Design Engineer take-home at Dodo Payments.

## Live Link
- **Live Demo**: [https://YOUR-SITE.netlify.app](https://YOUR-SITE.netlify.app)
- **Source Code**: [https://github.com/Mtharan93/dodo-visual-toy](https://github.com/Mtharan93/dodo-visual-toy)

## What I Built
Halftone Lens transforms any word or sentence into an analog halftone dot field rendered in ink on textured paper. Users can type custom text up to 40 characters across up to four lines, which morphs cell-by-cell into the new word with smooth staggered noise transitions. The pointer controls a physical lens with weight and momentum: within the lens, halftone dots seamlessly shift into density-mapped ASCII typography with magnification distortion, while surrounding dots press outward against the paper with spring dynamics and shockwaves.

## How to Play

| Interaction | Control | Effect |
| :--- | :--- | :--- |
| **Type Word** | Any printable key | Types letters into the word (first keystroke replaces default, max 40 characters, auto-wrap up to 4 lines) |
| **Delete** | <kbd>Backspace</kbd> | Removes previous character (supports key hold; empty word renders clean blank field) |
| **New Line** | <kbd>Enter</kbd> | Adds manual line break (up to 4 lines total) |
| **Reset** | <kbd>Escape</kbd> | Resets word to `"DODO"` |
| **Move Pointer / Touch** | Move Mouse / Drag Finger | Moves the physical lens with spring lag and velocity squash & stretch |
| **Press & Hold** | Click & Hold Pointer | Lens expands smoothly to 1.6× radius with physical suction |
| **Release / Click** | Release Pointer or Tap | Lens springs back and triggers a high-speed radial shockwave |
| **Switch Themes** | <kbd>Alt</kbd>+<kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> or Dock Dots | Eased 400ms RGB transition (Paper, Night, Lime) |
| **Save PNG** | <kbd>Alt</kbd>+<kbd>S</kbd> or Dock Button | Exports high-resolution PNG snapshot matching screen DPR |
| **Grid & Lens Scale** | Dock Sliders | Adjusts halftone cell size (6–24px) and base lens radius (80–220px) |
| **Mobile Keyboard** | Tap "Type anything" Hint | Opens mobile virtual keyboard via synchronized focus target |

## Choices I Made
- **Why not Paper Shaders**: I looked at it as a starting point, but the lens, ASCII swap, spring physics and per-cell word morph needed one custom fragment shader with shared state, so I wrote raw WebGL2 instead. One shader, one draw call, zero runtime dependencies.
- **Why vanilla WebGL2?** Eliminating framework overhead enables zero-allocation 60fps rendering at full retina resolution, deterministic GPU uniform pipes, and instant startup times in a sub-20 KB gzip bundle.
- **Why a critically-damped spring lens?** Real physical tools have mass, inertia, and elasticity. Spring acceleration and velocity-aligned squash and stretch transform a sterile cursor into an object with tactile weight.
- **Why ASCII inside halftone?** Both halftone screens and ASCII art share the same root principle: quantizing continuous tonal density into discrete symbolic marks. The lens reveals the digital substrate underneath the analog ink dot print.
- **Why three themes only?** A tightly curated palette (warm Paper & Ink, high-contrast Night with neon accent, and editorial Lime) delivers strong visual identity and intentional contrast hierarchies without the decision fatigue of arbitrary color pickers.

## What I'd Explore Next
- **Webcam input where brightness drives the dot field**: Streaming camera luminance directly into the density sampler to produce real-time halftone mirror portraits.
- **Sound-reactive dots**: Utilizing the Web Audio API to modulate halftone dot radius and pulse shockwaves to audio transients and beat drops.
- **SDF text for crisper edges at huge sizes**: Generating multi-channel signed distance fields for razor-sharp edge transitions at extreme zoom scales.
- **A paper-texture normal map**: Simulating physical paper fiber relief, micro-shadows, and ink bleed with procedural bump shaders.
- **Share-by-URL for word and theme**: Encoding text, theme, and lens parameters into shareable hash fragments (`#text=DODO&theme=2`).
- **WebGPU compute for particle dots**: Transitioning dots from a fixed grid into an unconstrained N-body particle simulation with physical collisions.

## Run Locally

```bash
# Clone the repository
git clone https://github.com/Mtharan93/dodo-visual-toy.git
cd dodo-visual-toy

# Install dependencies
npm install

# Start local dev server
npm run dev

# Build production bundle
npm run build

# Preview production build
npm run preview
```
