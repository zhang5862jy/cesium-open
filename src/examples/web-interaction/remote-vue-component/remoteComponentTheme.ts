/** Host-owned styles injected into the component's ShadowRoot. */
export const REMOTE_COMPONENT_SHADOW_STYLE = `
  :host {
    display: block;
    width: min(510px, 100%);
    color-scheme: dark;
    contain: layout style paint;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  button {
    font: inherit;
  }

  .remote-card {
    position: relative;
    width: 100%;
    padding: clamp(22px, 4vw, 34px);
    overflow: hidden;
    color: #eaf3ff;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    background:
      linear-gradient(145deg, rgb(24 50 81 / 97%), rgb(12 29 51 / 99%)),
      #10243b;
    border: 1px solid rgb(129 177 225 / 28%);
    border-radius: 18px;
    box-shadow:
      0 24px 50px rgb(13 34 58 / 22%),
      inset 0 1px rgb(255 255 255 / 8%);
  }

  .remote-card__glow {
    position: absolute;
    top: -100px;
    right: -80px;
    width: 260px;
    height: 260px;
    background: radial-gradient(circle, rgb(72 155 255 / 26%), transparent 70%);
    pointer-events: none;
  }

  .remote-card__header,
  .remote-card__body {
    position: relative;
  }

  .remote-card__eyebrow {
    color: #70aef4;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.18em;
  }

  .remote-card h2 {
    margin: 8px 0 0;
    color: #eaf3ff;
    font-size: clamp(20px, 3vw, 27px);
    font-weight: 680;
    letter-spacing: -0.025em;
  }

  .remote-card__header p {
    max-width: 420px;
    margin: 9px 0 0;
    color: #9db0c6;
    font-size: 10px;
    line-height: 1.7;
  }

  .remote-card__body {
    margin-top: 21px;
  }

  .remote-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    color: #6fe0b6;
    font-size: 8px;
    font-weight: 700;
    background: rgb(35 175 127 / 10%);
    border: 1px solid rgb(77 213 166 / 20%);
    border-radius: 7px;
  }

  .remote-badge::before {
    width: 5px;
    height: 5px;
    content: "";
    background: #44d19f;
    border-radius: 50%;
  }

  .remote-text {
    margin: 14px 0 0;
    color: #91a5bc;
    font-size: 10px;
    line-height: 1.7;
  }

  .remote-metric {
    display: flex;
    align-items: end;
    justify-content: space-between;
    margin-top: 17px;
    padding: 14px 16px;
    background: rgb(255 255 255 / 5%);
    border: 1px solid rgb(255 255 255 / 7%);
    border-radius: 11px;
  }

  .remote-metric span {
    color: #91a6bc;
    font-size: 9px;
  }

  .remote-metric strong {
    color: #ffffff;
    font-size: 28px;
    font-weight: 620;
    line-height: 1;
  }

  .remote-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 13px;
  }

  .remote-button {
    min-height: 34px;
    padding: 0 12px;
    color: #b9c9da;
    font-size: 9px;
    font-weight: 700;
    background: rgb(255 255 255 / 5%);
    border: 1px solid rgb(255 255 255 / 10%);
    border-radius: 8px;
    cursor: pointer;
    transition: 140ms ease;
  }

  .remote-button:hover {
    color: #ffffff;
    background: rgb(255 255 255 / 9%);
    transform: translateY(-1px);
  }

  .remote-button--primary {
    color: #ffffff;
    background: linear-gradient(135deg, #2475d7, #45a0ef);
    border-color: transparent;
    box-shadow: 0 7px 18px rgb(31 113 204 / 22%);
  }

  .boundary-fallback {
    padding: 24px;
    color: #ffbbc1;
    font: 600 12px/1.7 Inter, ui-sans-serif, system-ui, sans-serif;
    text-align: center;
    background: #291c29;
    border: 1px solid #70404c;
    border-radius: 14px;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      transition-duration: 0.01ms !important;
    }
  }
`;
