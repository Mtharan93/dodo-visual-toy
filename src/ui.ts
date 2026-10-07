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
  private isPlaceholder: boolean = true;
  private isSelectedAll: boolean = false;

  private targetColors: ThemeColors;
  private currentColors: ThemeColors;
  private colorTransitionProgress: number = 1.0;
  private startColors: ThemeColors;

  private dockPill: HTMLElement | null = null;
  private hintElement: HTMLElement | null = null;
  private hintPrompt: HTMLElement | null = null;
  private charCounter: HTMLElement | null = null;
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
    let initialTheme = 0;
    try {
      const saved = localStorage.getItem('theme');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (parsed >= 0 && parsed < THEMES.length) {
          initialTheme = parsed;
        }
      }
    } catch {
      // LocalStorage access failsafe
    }

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
    this.hintPrompt = document.getElementById('hint-prompt');
    this.charCounter = document.getElementById('char-counter');
    this.mobileInput = document.getElementById('mobile-text-input') as HTMLInputElement;
    this.cellValDisplay = document.getElementById('cell-val');
    this.lensValDisplay = document.getElementById('lens-val');
    this.canvasElement = document.getElementById('gl-canvas') as HTMLCanvasElement;
    this.fallbackWordElement = document.getElementById('fallback-word');

    const cellSlider = document.getElementById('cell-slider') as HTMLInputElement;
    const lensSlider = document.getElementById('lens-slider') as HTMLInputElement;
    const exportBtn = document.getElementById('export-btn');

    // Update active button state for initial theme
    for (let i = 0; i < 3; i++) {
      const btn = document.getElementById(`theme-btn-${i}`);
      if (btn) {
        const isActive = i === this.state.activeThemeIndex;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      }
    }

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

    // Mobile input listener (supports virtual mobile keyboards)
    if (this.mobileInput) {
      this.mobileInput.value = this.state.currentWord;

      this.mobileInput.addEventListener('beforeinput', (e: InputEvent) => {
        if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') {
          e.preventDefault();
          this.handleBackspace();
        } else if (e.inputType === 'insertLineBreak') {
          e.preventDefault();
          this.handleEnter();
        } else if (e.data) {
          e.preventDefault();
          for (const char of e.data) {
            this.handlePrintableChar(char);
          }
        }
      });

      this.mobileInput.addEventListener('input', () => {
        // Fallback sync if beforeinput was not triggered
        if (this.mobileInput && this.mobileInput.value !== this.state.currentWord) {
          this.setWord(this.mobileInput.value);
        }
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

    this.updateCharCounter(this.state.currentWord);
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

    try {
      localStorage.setItem('theme', String(index));
    } catch {
      // LocalStorage access failsafe
    }

    // Update root and body attributes for theme CSS variables
    document.documentElement.setAttribute('data-theme', `${index}`);
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
    const lines = clean.split('\n').slice(0, 4);
    clean = lines.join('\n');
    if (clean.length > 40) {
      clean = clean.slice(0, 40);
    }

    this.state.currentWord = clean;

    if (this.mobileInput && this.mobileInput.value !== clean) {
      this.mobileInput.value = clean;
    }

    if (this.canvasElement) {
      this.canvasElement.setAttribute('aria-label', clean.replace(/\n/g, ' ') || 'Halftone Lens');
    }

    if (this.fallbackWordElement) {
      this.fallbackWordElement.textContent = clean.replace(/\n/g, ' ') || 'DODO';
    }

    this.updateCharCounter(clean);
    this.onTypingAction(clean);
    this.events.onTextChange(clean);
  }

  private updateCharCounter(word: string) {
    if (this.charCounter) {
      const count = word.length;
      this.charCounter.textContent = `${count}/40`;
      this.charCounter.classList.toggle('counter-warn', count >= 36);
    }
  }

  public triggerLimitShake() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const target = this.hintElement || this.charCounter;
    if (target) {
      target.classList.remove('shake');
      // Trigger DOM reflow to allow consecutive shakes
      void target.offsetWidth;
      target.classList.add('shake');
      window.setTimeout(() => {
        target.classList.remove('shake');
      }, 200);
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    // Ignore events when focus is on range inputs or interactive buttons
    const activeEl = document.activeElement;
    if (
      activeEl &&
      activeEl !== document.body &&
      activeEl !== this.mobileInput &&
      activeEl !== this.canvasElement &&
      (activeEl.tagName === 'BUTTON' || (activeEl.tagName === 'INPUT' && (activeEl as HTMLInputElement).type === 'range'))
    ) {
      // Allow Escape even from focused controls
      if (e.key === 'Escape') {
        (activeEl as HTMLElement).blur();
      } else {
        return;
      }
    }

    // Alt shortcuts for themes and PNG export
    if (e.altKey) {
      if (e.key === '1') {
        e.preventDefault();
        this.setTheme(0);
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        this.setTheme(1);
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        this.setTheme(2);
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.events.onSavePNG();
        return;
      }
      return;
    }

    // Ctrl/Cmd+A: Select all
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      this.isSelectedAll = true;
      return;
    }

    // Ignore other Ctrl/Cmd combinations (e.g. Ctrl+R, Ctrl+C)
    if (e.ctrlKey || e.metaKey) {
      return;
    }

    // Reset to "DODO": Escape
    if (e.key === 'Escape') {
      e.preventDefault();
      this.isPlaceholder = true;
      this.isSelectedAll = false;
      this.setWord('DODO');
      return;
    }

    // Backspace: Delete character (supports hold/repeat)
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.handleBackspace();
      return;
    }

    // Enter: Newline (if max 4 lines not exceeded)
    if (e.key === 'Enter') {
      e.preventDefault();
      this.handleEnter();
      return;
    }

    // Printable character input
    if (e.key.length === 1) {
      e.preventDefault();
      this.handlePrintableChar(e.key);
    }
  }

  private handleBackspace() {
    if (this.isPlaceholder || this.isSelectedAll) {
      this.isPlaceholder = false;
      this.isSelectedAll = false;
      this.setWord('');
      return;
    }

    const current = this.state.currentWord;
    if (current.length > 0) {
      this.setWord(current.slice(0, -1));
    }
  }

  private handleEnter() {
    if (this.isPlaceholder || this.isSelectedAll) {
      this.isPlaceholder = false;
      this.isSelectedAll = false;
      this.setWord('');
      return;
    }

    const current = this.state.currentWord;
    const lines = (current.match(/\n/g) || []).length + 1;
    if (lines < 4 && current.length < 40 && current.length > 0) {
      this.setWord(current + '\n');
    } else {
      this.triggerLimitShake();
    }
  }

  private handlePrintableChar(char: string) {
    if (this.isPlaceholder || this.isSelectedAll) {
      this.isPlaceholder = false;
      this.isSelectedAll = false;
      this.setWord(char.toUpperCase());
      return;
    }

    const current = this.state.currentWord;
    if (current.length < 40) {
      this.setWord(current + char.toUpperCase());
    } else {
      this.triggerLimitShake();
    }
  }

  private onTypingAction(word: string) {
    // If word is empty or is placeholder, keep the hint prompt visible
    if (!word || word.length === 0 || this.isPlaceholder) {
      if (this.hintPrompt) {
        this.hintPrompt.classList.remove('faded');
      }
      if (this.idleTypingTimer) {
        window.clearTimeout(this.idleTypingTimer);
      }
      return;
    }

    if (this.hintPrompt) {
      this.hintPrompt.classList.add('faded');
    }

    // Reset 8s idle timer for typing hint prompt
    if (this.idleTypingTimer) {
      window.clearTimeout(this.idleTypingTimer);
    }
    this.idleTypingTimer = window.setTimeout(() => {
      if (this.hintPrompt) {
        this.hintPrompt.classList.remove('faded');
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
