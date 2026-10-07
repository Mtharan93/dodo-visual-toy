/**
 * ui.ts
 * Dock controls, theme transitions, keyboard input handling, mobile input sync, and PNG export.
 */

export interface ThemeColors {
  paper: [number, number, number];
  ink: [number, number, number];
  accent: [number, number, number];
  lensPaper: [number, number, number];
}

export interface UIState {
  currentWord: string;
  cellSize: number;
  lensRadius: number;
  activeThemeIndex: number;
  colors: ThemeColors;
}

export interface UIEvents {
  onTextChange: (newWord: string) => void;
  onCellSizeChange: (cellSize: number) => void;
  onLensRadiusChange: (radius: number) => void;
  onSavePNG: () => void;
}

// Helper to convert hex color to normalized [0, 1] RGB tuple
function hexToRGB(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

// 3 Curated Themes
export const THEMES: ThemeColors[] = [
  // 0: Paper
  {
    paper: hexToRGB('#EFEBE3'),
    ink: hexToRGB('#141311'),
    accent: hexToRGB('#141311'),
    lensPaper: hexToRGB('#E2DDD2'),
  },
  // 1: Night
  {
    paper: hexToRGB('#0E0E0D'),
    ink: hexToRGB('#EDEAE2'),
    accent: hexToRGB('#C8F135'),
    lensPaper: hexToRGB('#181816'),
  },
  // 2: Lime
  {
    paper: hexToRGB('#C8F135'),
    ink: hexToRGB('#0E0E0D'),
    accent: hexToRGB('#0E0E0D'),
    lensPaper: hexToRGB('#B8DE2E'),
  },
];

export class UIController {
  public state: UIState;
  private targetColors: ThemeColors;
  private currentColors: ThemeColors;
  private colorTransitionProgress: number = 1.0;
  private startColors: ThemeColors;

  private dockPill: HTMLElement | null = null;
  private hintElement: HTMLElement | null = null;
  private mobileInput: HTMLInputElement | null = null;
  private cellValDisplay: HTMLElement | null = null;
  private lensValDisplay: HTMLElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private fallbackWordElement: HTMLElement | null = null;

  private idleDockTimer: number = 0;
  private idleTypingTimer: number = 0;
  private events: UIEvents;

  constructor(events: UIEvents) {
    this.events = events;
    const initialTheme = 0;

    this.startColors = { ...THEMES[initialTheme] };
    this.targetColors = { ...THEMES[initialTheme] };
    this.currentColors = { ...THEMES[initialTheme] };

    this.state = {
      currentWord: 'DODO',
      cellSize: 11,
      lensRadius: 130,
      activeThemeIndex: initialTheme,
      colors: this.currentColors,
    };
  }

  public init() {
    this.dockPill = document.getElementById('dock-pill');
    this.hintElement = document.getElementById('type-hint');
    this.mobileInput = document.getElementById('mobile-text-input') as HTMLInputElement;
    this.cellValDisplay = document.getElementById('cell-val');
    this.lensValDisplay = document.getElementById('lens-val');
    this.canvasElement = document.getElementById('gl-canvas') as HTMLCanvasElement;
    this.fallbackWordElement = document.getElementById('fallback-word');

    const cellSlider = document.getElementById('cell-slider') as HTMLInputElement;
    const lensSlider = document.getElementById('lens-slider') as HTMLInputElement;
    const exportBtn = document.getElementById('export-btn');

    // Cell slider input
    if (cellSlider) {
      cellSlider.addEventListener('input', () => {
        const val = parseInt(cellSlider.value, 10);
        this.state.cellSize = val;
        if (this.cellValDisplay) this.cellValDisplay.textContent = `${val}`;
        this.events.onCellSizeChange(val);
        this.resetDockIdleTimer();
      });
    }

    // Lens slider input
    if (lensSlider) {
      lensSlider.addEventListener('input', () => {
        const val = parseInt(lensSlider.value, 10);
        this.state.lensRadius = val;
        if (this.lensValDisplay) this.lensValDisplay.textContent = `${val}`;
        this.events.onLensRadiusChange(val);
        this.resetDockIdleTimer();
      });
    }

    // Theme selector dots
    for (let i = 0; i < 3; i++) {
      const btn = document.getElementById(`theme-btn-${i}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.setTheme(i);
          this.resetDockIdleTimer();
        });
      }
    }

    // Save PNG button
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.events.onSavePNG();
        this.resetDockIdleTimer();
      });
    }

    // Hint button click -> Focus mobile input
    if (this.hintElement) {
      this.hintElement.addEventListener('click', () => {
        if (this.mobileInput) {
          this.mobileInput.focus();
        }
      });
    }

    // Mobile input listener
    if (this.mobileInput) {
      this.mobileInput.addEventListener('input', () => {
        this.setWord(this.mobileInput!.value);
      });
    }

    // Global keyboard listener
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      this.handleKeyDown(e);
    });

    // Pointer move over dock resets dock idle timer
    window.addEventListener('pointermove', () => {
      this.resetDockIdleTimer();
    });

    this.resetDockIdleTimer();
  }

  public setTheme(index: number) {
    if (index < 0 || index >= THEMES.length) return;
    if (this.state.activeThemeIndex === index) return;

    this.startColors = {
      paper: [...this.currentColors.paper],
      ink: [...this.currentColors.ink],
      accent: [...this.currentColors.accent],
      lensPaper: [...this.currentColors.lensPaper],
    };
    this.targetColors = THEMES[index];
    this.colorTransitionProgress = 0.0;
    this.state.activeThemeIndex = index;

    // Update body attribute for theme CSS variables
    document.body.setAttribute('data-theme', `${index}`);

    // Update active button state
    for (let i = 0; i < 3; i++) {
      const btn = document.getElementById(`theme-btn-${i}`);
      if (btn) {
        const isActive = i === index;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      }
    }

    // Update theme-color meta tag
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      const hexList = ['#EFEBE3', '#0E0E0D', '#C8F135'];
      metaTheme.setAttribute('content', hexList[index]);
    }
  }

  public setWord(newWord: string) {
    let clean = newWord.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = clean.split('\n').slice(0, 2);
    clean = lines.join('\n');
    if (clean.length > 14) {
      clean = clean.slice(0, 14);
    }

    this.state.currentWord = clean;

    if (this.mobileInput && this.mobileInput.value !== clean) {
      this.mobileInput.value = clean;
    }

    if (this.canvasElement) {
      this.canvasElement.setAttribute('aria-label', clean.replace('\n', ' ') || 'DODO');
    }

    if (this.fallbackWordElement) {
      this.fallbackWordElement.textContent = clean.replace('\n', ' ') || 'DODO';
    }

    this.onTypingAction();
    this.events.onTextChange(clean);
  }

  private handleKeyDown(e: KeyboardEvent) {
    // Ignore when focus is inside a regular form control (except mobile-input)
    if (
      document.activeElement &&
      document.activeElement !== document.body &&
      document.activeElement !== this.mobileInput &&
      document.activeElement !== this.canvasElement &&
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')
    ) {
      return;
    }

    // Theme shortcuts: 1, 2, 3
    if (e.key === '1') {
      this.setTheme(0);
      return;
    }
    if (e.key === '2') {
      this.setTheme(1);
      return;
    }
    if (e.key === '3') {
      this.setTheme(2);
      return;
    }

    // Save PNG shortcut: S (without meta/ctrl)
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.events.onSavePNG();
      return;
    }

    // Reset to "DODO": Escape
    if (e.key === 'Escape') {
      e.preventDefault();
      this.setWord('DODO');
      return;
    }

    // Backspace: Delete character
    if (e.key === 'Backspace') {
      e.preventDefault();
      const current = this.state.currentWord;
      if (current.length > 0) {
        this.setWord(current.slice(0, -1));
      }
      return;
    }

    // Enter: Newline (if max 2 lines not exceeded)
    if (e.key === 'Enter') {
      e.preventDefault();
      const current = this.state.currentWord;
      if (!current.includes('\n') && current.length < 13 && current.length > 0) {
        this.setWord(current + '\n');
      }
      return;
    }

    // Printable character input
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const current = this.state.currentWord;
      if (current.length < 14) {
        this.setWord(current + e.key.toUpperCase());
      }
    }
  }

  private onTypingAction() {
    if (this.hintElement) {
      this.hintElement.classList.add('faded');
    }

    // Reset 8s idle timer for typing hint
    if (this.idleTypingTimer) {
      window.clearTimeout(this.idleTypingTimer);
    }
    this.idleTypingTimer = window.setTimeout(() => {
      if (this.hintElement) {
        this.hintElement.classList.remove('faded');
      }
    }, 8000);
  }

  private resetDockIdleTimer() {
    if (this.dockPill) {
      this.dockPill.classList.remove('dock-idle');
    }

    if (this.idleDockTimer) {
      window.clearTimeout(this.idleDockTimer);
    }

    // Auto-fade dock to 35% opacity after 3s idle
    this.idleDockTimer = window.setTimeout(() => {
      if (this.dockPill) {
        this.dockPill.classList.add('dock-idle');
      }
    }, 3000);
  }

  public update(dtSeconds: number) {
    // 400ms color interpolation
    if (this.colorTransitionProgress < 1.0) {
      this.colorTransitionProgress += dtSeconds / 0.4;
      if (this.colorTransitionProgress > 1.0) {
        this.colorTransitionProgress = 1.0;
      }

      // Smooth ease-out curve
      const t = 1 - Math.pow(1 - this.colorTransitionProgress, 3);

      const lerpVec3 = (
        a: [number, number, number],
        b: [number, number, number]
      ): [number, number, number] => [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ];

      this.currentColors = {
        paper: lerpVec3(this.startColors.paper, this.targetColors.paper),
        ink: lerpVec3(this.startColors.ink, this.targetColors.ink),
        accent: lerpVec3(this.startColors.accent, this.targetColors.accent),
        lensPaper: lerpVec3(this.startColors.lensPaper, this.targetColors.lensPaper),
      };

      this.state.colors = this.currentColors;
    }
  }
}
