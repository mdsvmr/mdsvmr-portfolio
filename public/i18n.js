// English / Japanese switch. English lives in the HTML; this file holds the Japanese copy.
// The chosen language is remembered for the browser session (sessionStorage), so a new visit
// always starts in English. It is applied before the page animates in.
(function () {
  var JA = {
    "nav.index": "インデックス",
    "nav.projects": "プロジェクト",
    "nav.works": "作品",
    "nav.frames": "フレーム",
    "nav.about": "プロフィール",

    "index.bio": "ピクセルを丁寧につくり込み、AIとともにプロダクトを届けるプロダクトデザイナー。企業がブランドを成長させるための、最高のプロダクトをつくっています。",
    "index.current": "現在",
    "index.currentProject": '<a href="https://www.shopra.ai/" class="link" target="_blank" rel="noopener">Shopra</a> をデザイン中',
    "index.currentDesc": "サプライと小売のデータを一つのインテリジェンスレイヤーに統合し、チームがより速く動き、より賢く成長できるようにします。",
    "index.past": "これまで",
    "index.pastList": '<a href="https://www.ezpairs.xyz/" class="link" target="_blank" rel="noopener">Ezpairs</a>、<a href="https://www.dipainhouse.com/" class="link" target="_blank" rel="noopener">Dipa Inhouse</a>、<a href="https://skilvul.com/" class="link" target="_blank" rel="noopener">Skilvul</a>、<a href="https://slabdsgn.com/" class="link" target="_blank" rel="noopener">Slab</a> など。',
    "index.built": "最近つくったもの",
    "index.cap1": "ライブ折れ線チャート（1時間）",
    "index.cap3": "ジェネレーティブASCIIチャート",
    "index.cap4": "料金プランセレクター",
    "index.cap5": "ウォレット接続モーダル",

    "projects.title": "プロジェクト",
    "projects.desc": "ゼロから構築したクライアントワーク。複雑なアイデアを実際に動くプロダクトへ。",
    "projects.ezpairs": "分散型の暗号資産ペアトレーディングプラットフォーム。",
    "projects.caseStudy": "ケーススタディを見る",
    "projects.shopra": "飲料ブランド向けのAIデータインテリジェンスプラットフォーム。",

    "works.title": "作品",
    "works.desc": "私のデザインの美学とセンスを映したビジュアル作品とコンセプト。",

    "frames.title": "フレーム",
    "frames.desc": "レンズを通した日常。Fujifilm X-M5で撮影したビジュアルストーリーのコレクション。",

    "about.title": "プロフィール",
    "about.bio": "インドネシアを拠点とするプロダクトデザイナー。この5年以上、初期のコンセプトから本番リリースまで、いくつものプロダクトを世に送り出してきました。",
    "about.process": "デザインプロセス",
    "about.processDesc": "分析的な問題解決と、確かなビジュアルの美学を組み合わせています。AIを活用してアウトプットを高め、より鋭いインサイトと質の高いデザインを生み出します。",
    "about.experiences": "経歴",
    "role.product": "プロダクトデザイナー",
    "role.founding": "ファウンディングデザイナー",
    "role.senior": "シニアUI/UXデザイナー",
    "role.uiux": "UI/UXデザイナー",
    "role.uiuxIntern": "UI/UXデザイナー（インターン）",
    "role.uiIntern": "UIデザイナー（インターン）",
    "about.start": "プロジェクトを始める",
    "about.chat": "気軽にチャット",
    "about.connect": "つながる",
    "about.connectList": '<a href="https://www.instagram.com/mdsvmr" class="link" target="_blank" rel="noopener">Instagram</a>、<a href="https://www.behance.net/fahrezasugiono" class="link" target="_blank" rel="noopener">Behance</a>、<a href="https://medium.com/@fahrezasugiono" class="link" target="_blank" rel="noopener">Medium</a>、<a href="https://www.linkedin.com/in/mokhammadfahreza/" class="link" target="_blank" rel="noopener">LinkedIn</a>。'
  };

  var FADE_OUT_MS = 200;
  var root = document.documentElement;
  var nodes = Array.prototype.slice.call(document.querySelectorAll("[data-i18n]"));
  var buttons = Array.prototype.slice.call(document.querySelectorAll(".lang-switch__option"));
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Keep the English markup that ships in the page so we can switch back.
  nodes.forEach(function (el) { el._en = el.innerHTML; });

  function saved() {
    try { return sessionStorage.getItem("lang") === "ja" ? "ja" : "en"; } catch (e) { return "en"; }
  }

  // Older versions kept the choice forever in localStorage; clear it so English is the default again.
  try { localStorage.removeItem("lang"); } catch (e) {}

  function apply(lang) {
    nodes.forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var html = lang === "ja" && JA[key] != null ? JA[key] : el._en;
      if (el.innerHTML !== html) el.innerHTML = html;
    });
    root.lang = lang;
    buttons.forEach(function (b) {
      var on = b.getAttribute("data-lang") === lang;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  var current = saved();
  apply(current);
  root.classList.remove("lang-pending");

  function switchTo(lang) {
    if (lang === current) return;
    current = lang;
    try { sessionStorage.setItem("lang", lang); } catch (e) {}
    if (reduceMotion.matches) {
      apply(lang);
      return;
    }
    // Simple fade: text fades out, swaps language, fades back in.
    root.classList.add("is-lang-fading");
    setTimeout(function () {
      apply(lang);
      requestAnimationFrame(function () {
        root.classList.remove("is-lang-fading");
      });
    }, FADE_OUT_MS);
  }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () { switchTo(b.getAttribute("data-lang")); });
  });
})();
