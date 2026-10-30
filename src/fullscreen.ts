import './fullscreen.css';

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
};

/** Fullscreen expands the complete game, including its menus and mobile drawers. */
export function initializeFullscreen(): void {
  const doc = document as WebkitDocument;
  const root = document.documentElement as WebkitElement;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const installedFullscreen = window.matchMedia('(display-mode: fullscreen)');
  const portrait = window.matchMedia('(orientation: portrait) and (max-width: 750px)');
  const orientation = screen.orientation as LockableOrientation | undefined;
  const rotationNotice = document.querySelector<HTMLElement>('.orientation');
  const gameDialog = document.querySelector<HTMLDialogElement>('#dialog');
  const buttons: HTMLButtonElement[] = [];
  let pending = false;
  let lockedOrientation = false;

  const help = document.createElement('dialog');
  help.id = 'fullscreenHelp';
  help.className = 'fullscreen-help';
  help.setAttribute('aria-labelledby', 'fullscreenHelpTitle');
  help.innerHTML = '<h2 id="fullscreenHelpTitle">全屏显示</h2><p></p><form method="dialog"><button>返回游戏</button></form>';
  document.body.append(help);

  const currentElement = () => doc.fullscreenElement ?? doc.webkitFullscreenElement;
  const isInstalled = () => standalone.matches || installedFullscreen.matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  function showHelp(message: string): void {
    help.querySelector('p')!.textContent = message;
    if (!help.open) help.showModal();
  }

  function unsupportedMessage(): string {
    if (isInstalled()) return '游戏已在独立窗口中运行，没有浏览器地址栏。当前系统不支持进一步切换全屏；横屏即可完整显示游戏。';
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      return '此浏览器暂不支持网页全屏。在 Safari 中点击“分享”→“添加到主屏幕”，再从主屏幕打开游戏，可隐藏浏览器地址栏。请横屏游玩。';
    }
    return '当前浏览器不支持网页全屏。可使用浏览器菜单中的“安装应用”或“添加到主屏幕”，再从应用图标横屏打开游戏。';
  }

  function sync(): void {
    const active = Boolean(currentElement());
    document.documentElement.dataset.fullscreen = String(active);
    for (const button of buttons) {
      const label = active ? '退出全屏' : '全屏';
      button.textContent = `${active ? '↙' : '⛶'} ${label}`;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(active));
      button.title = active ? '退出全屏显示' : '全屏显示整个游戏';
      button.disabled = pending;
    }
    if (!active && lockedOrientation) {
      orientation?.unlock();
      lockedOrientation = false;
    }
    window.dispatchEvent(new Event('resize'));
  }

  // A modal dialog makes its siblings inert. Keep the portrait actions inside
  // the initial game menu while it is open, so they work on the first visit too.
  function placeRotationNotice(): void {
    if (!rotationNotice) return;
    const parent = portrait.matches && gameDialog?.open ? gameDialog : document.body;
    if (rotationNotice.parentElement !== parent) parent.append(rotationNotice);
  }

  async function toggle(): Promise<void> {
    if (pending) return;
    if (!currentElement() && !root.requestFullscreen && !root.webkitRequestFullscreen) {
      showHelp(unsupportedMessage());
      return;
    }
    pending = true;
    sync();
    try {
      if (currentElement()) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } else {
        if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
        else await root.webkitRequestFullscreen?.();
        // Rotation locking is optional and only attempted after entering
        // fullscreen. Failure leaves normal manual landscape rotation available.
        if (currentElement() && window.matchMedia('(pointer: coarse)').matches && orientation?.lock) {
          try {
            await orientation.lock('landscape');
            lockedOrientation = true;
            if (!currentElement()) {
              orientation.unlock();
              lockedOrientation = false;
            }
          } catch { /* Some mobile browsers do not allow orientation locking. */ }
        }
      }
    } catch {
      showHelp('浏览器未允许进入或退出全屏。可再次点击全屏按钮；也可通过浏览器菜单安装应用或添加到主屏幕后打开。');
    } finally {
      pending = false;
      sync();
    }
  }

  for (const selector of ['.rail-global-tools', '.mobile-nav', '.cinema-tools', '.orientation']) {
    const container = document.querySelector(selector);
    if (!container) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fullscreen-toggle';
    button.dataset.action = 'fullscreen';
    button.addEventListener('click', () => { void toggle(); });
    container.append(button);
    buttons.push(button);
  }

  doc.addEventListener('fullscreenchange', sync);
  doc.addEventListener('webkitfullscreenchange', sync);
  doc.addEventListener('fullscreenerror', () => { pending = false; sync(); });
  doc.addEventListener('webkitfullscreenerror', () => {
    pending = false;
    sync();
    showHelp('浏览器未允许全屏显示。请重试，或使用“添加到主屏幕”从应用图标打开游戏。');
  });
  portrait.addEventListener('change', placeRotationNotice);
  if (gameDialog) new MutationObserver(placeRotationNotice).observe(gameDialog, { attributes: true, attributeFilter: ['open'] });
  window.addEventListener('resize', placeRotationNotice);
  placeRotationNotice();
  sync();
}
