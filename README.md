# Halftone Lens

`dodo-visual-toy` is an interactive visual toy and typographic experiment built for a Design Engineer take-home at Dodo Payments.

## Live Link
- **Live Demo**: [https://YOUR-SITE.netlify.app](https://YOUR-SITE.netlify.app)
- **Source Code**: [https://github.com/Mtharan93/dodo-visual-toy](https://github.com/Mtharan93/dodo-visual-toy)

## What I Built
Halftone Lens transforms any word into a tactile halftone dot field rendered in ink on textured paper. Users can type any custom text up to two lines, which morphs cell-by-cell into the new word with smooth staggered transitions. The pointer controls a physical lens with weight and momentum: within the lens, halftone dots seamlessly shift into density-mapped ASCII typography with magnification distortion, while surrounding dots press outward against the paper with spring dynamics and shockwaves.

## How to Play

| Interaction | Control | Effect |
| :--- | :--- | :--- |
| **Move Pointer / Touch** | Move Mouse / Drag Finger | Moves the physical lens with spring lag and velocity squash & stretch |
| **Press & Hold** | Click & Hold Pointer | Lens expands smoothly to 1.6× radius with heavy suction |
| **Release / Tap** | Release Pointer or Click | Lens springs back and triggers a high-speed radial shockwave |
| **Type Word** | Any printable key | Types letters into the word (max 14 characters, auto-fitting) |
| **New Line** | <kbd>Enter</kbd> | Adds a second line of text |
| **Delete** | <kbd>Backspace</kbd> | Removes the previous character |
| **Reset** | <kbd>Escape</kbd> | Resets word to `"DODO"` |
| **Switch Themes** | <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> or Dock Dots | Eased 400ms RGB transition (Paper, Night, Lime) |
| **Save PNG** | <kbd>S</kbd> or Dock Button | Exports high-resolution PNG snapshot matching screen DPR |
| **Grid & Lens Scale** | Dock Sliders | Adjusts halftone cell size (6–24px) and base lens radius (80–220px) |
| **Mobile Keyboard** | Tap "Type anything" Hint | Opens mobile virtual keyboard via synchronized focus target |

## Choices I Made
- **Why vanilla WebGL2?** Eliminating framework overhead enables zero-allocation 60fps rendering at full retina resolution, deterministic GPU uniform pipes, and instant startup times in a sub-20 KB gzip bundle.
- **Why a single fragment shader?** By calculating cell rasterization, staggered noise morphing, ASCII atlas lookup, shockwaves, and paper grain in one pass, we avoid multi-pass render targets and maintain maximum cache locality on integrated GPUs.
- **Why a critically-damped spring lens?** Real physical tools have mass, inertia, and elasticity. Spring acceleration and velocity-aligned squash and stretch transform a sterile cursor into an object with tactile weight.
- **Why ASCII inside halftone?** Both halftone screens and ASCII art share the same root principle: quantizing continuous tonal density into discrete symbolic marks. The lens reveals the digital substrate underneath the analog ink dot print.
- **Why three themes only?** A tightly curated palette (warm Paper & Ink, high-contrast Night with neon accent, and editorial Lime) delivers strong visual identity and intentional contrast hierarchies without the decision fatigue of arbitrary color pickers.

## What I'd Explore Next
- **Webcam & Video input**: Streaming camera luminance directly into the density sampler to produce real-time halftone mirror portraits.
- **Sound-reactive acoustics**: Utilizing the Web Audio API to modulate halftone dot radius and pulse shockwaves to audio transients and beat drops.
- **Signed Distance Field (SDF) glyphs**: Generating multi-channel SDF text masks for razor-sharp edge transitions at extreme zoom scales.
- **Normal-mapped paper grain**: Simulating physical paper fiber relief, micro-shadows, and ink bleed with procedural bump shaders.
- **URL state serialization**: Encoding text, theme, and lens parameters into shareable hash fragments (`#text=DODO&theme=2`).
- **WebGPU compute particles**: Transitioning dots from a fixed grid into an unconstrained N-body particle simulation with physical collisions.

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
