const h = React.createElement;
const { Fragment, useEffect, useRef } = React;
const { createRoot } = ReactDOM;

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [1, 1, 1];
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  ];
};

const grainientVertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const grainientFragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uTimeSpeed;
uniform float uColorBalance;
uniform float uWarpStrength;
uniform float uWarpFrequency;
uniform float uWarpSpeed;
uniform float uWarpAmplitude;
uniform float uBlendAngle;
uniform float uBlendSoftness;
uniform float uRotationAmount;
uniform float uNoiseScale;
uniform float uGrainAmount;
uniform float uGrainScale;
uniform float uGrainAnimated;
uniform float uContrast;
uniform float uGamma;
uniform float uSaturation;
uniform vec2 uCenterOffset;
uniform float uZoom;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
out vec4 fragColor;
#define S(a,b,t) smoothstep(a,b,t)
mat2 Rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float n=mix(mix(dot(-1.0+2.0*hash(i+vec2(0.0,0.0)),f-vec2(0.0,0.0)),dot(-1.0+2.0*hash(i+vec2(1.0,0.0)),f-vec2(1.0,0.0)),u.x),mix(dot(-1.0+2.0*hash(i+vec2(0.0,1.0)),f-vec2(0.0,1.0)),dot(-1.0+2.0*hash(i+vec2(1.0,1.0)),f-vec2(1.0,1.0)),u.x),u.y);return 0.5+0.5*n;}
void mainImage(out vec4 o, vec2 C){
  float t=iTime*uTimeSpeed;
  vec2 uv=C/iResolution.xy;
  float ratio=iResolution.x/iResolution.y;
  vec2 tuv=uv-0.5+uCenterOffset;
  tuv/=max(uZoom,0.001);
  float degree=noise(vec2(t*0.1,tuv.x*tuv.y)*uNoiseScale);
  tuv.y*=1.0/ratio;
  tuv*=Rot(radians((degree-0.5)*uRotationAmount+180.0));
  tuv.y*=ratio;
  float frequency=uWarpFrequency;
  float ws=max(uWarpStrength,0.001);
  float amplitude=uWarpAmplitude/ws;
  float warpTime=t*uWarpSpeed;
  tuv.x+=sin(tuv.y*frequency+warpTime)/amplitude;
  tuv.y+=sin(tuv.x*(frequency*1.5)+warpTime)/(amplitude*0.5);
  vec3 colLav=uColor1;
  vec3 colOrg=uColor2;
  vec3 colDark=uColor3;
  float b=uColorBalance;
  float s=max(uBlendSoftness,0.0);
  mat2 blendRot=Rot(radians(uBlendAngle));
  float blendX=(tuv*blendRot).x;
  float edge0=-0.3-b-s;
  float edge1=0.2-b+s;
  float v0=0.5-b+s;
  float v1=-0.3-b-s;
  vec3 layer1=mix(colDark,colOrg,S(edge0,edge1,blendX));
  vec3 layer2=mix(colOrg,colLav,S(edge0,edge1,blendX));
  vec3 col=mix(layer1,layer2,S(v0,v1,tuv.y));
  vec2 grainUv=uv*max(uGrainScale,0.001);
  if(uGrainAnimated>0.5){grainUv+=vec2(iTime*0.05);}
  float grain=fract(sin(dot(grainUv,vec2(12.9898,78.233)))*43758.5453);
  col+=(grain-0.5)*uGrainAmount;
  col=(col-0.5)*uContrast+0.5;
  float luma=dot(col,vec3(0.2126,0.7152,0.0722));
  col=mix(vec3(luma),col,uSaturation);
  col=pow(max(col,0.0),vec3(1.0/max(uGamma,0.001)));
  col=clamp(col,0.0,1.0);
  o=vec4(col,1.0);
}
void main(){
  vec4 o=vec4(0.0);
  mainImage(o,gl_FragCoord.xy);
  fragColor=o;
}
`;

function Grainient({
  color1 = "#5f1c12",
  color2 = "#20242a",
  color3 = "#070915",
  timeSpeed = 0.16,
  colorBalance = -0.08,
  warpStrength = 0.8,
  warpFrequency = 4.0,
  warpSpeed = 1.2,
  warpAmplitude = 70.0,
  blendAngle = -12.0,
  blendSoftness = 0.12,
  rotationAmount = 360.0,
  noiseScale = 1.8,
  grainAmount = 0.14,
  grainScale = 2.2,
  grainAnimated = false,
  contrast = 1.22,
  gamma = 1.05,
  saturation = 0.82,
  centerX = -0.08,
  centerY = 0.04,
  zoom = 0.82,
  className = ""
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: false
    });
    if (!gl) {
      canvas.classList.add("grainient-fallback");
      return undefined;
    }

    const compileShader = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(gl.VERTEX_SHADER, grainientVertex);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, grainientFragment);
    if (!vertexShader || !fragmentShader) return undefined;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return undefined;

    const positionLocation = gl.getAttribLocation(program, "position");
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uniform = (name) => gl.getUniformLocation(program, name);
    const uniforms = {
      iResolution: uniform("iResolution"),
      iTime: uniform("iTime"),
      uTimeSpeed: uniform("uTimeSpeed"),
      uColorBalance: uniform("uColorBalance"),
      uWarpStrength: uniform("uWarpStrength"),
      uWarpFrequency: uniform("uWarpFrequency"),
      uWarpSpeed: uniform("uWarpSpeed"),
      uWarpAmplitude: uniform("uWarpAmplitude"),
      uBlendAngle: uniform("uBlendAngle"),
      uBlendSoftness: uniform("uBlendSoftness"),
      uRotationAmount: uniform("uRotationAmount"),
      uNoiseScale: uniform("uNoiseScale"),
      uGrainAmount: uniform("uGrainAmount"),
      uGrainScale: uniform("uGrainScale"),
      uGrainAnimated: uniform("uGrainAnimated"),
      uContrast: uniform("uContrast"),
      uGamma: uniform("uGamma"),
      uSaturation: uniform("uSaturation"),
      uCenterOffset: uniform("uCenterOffset"),
      uZoom: uniform("uZoom"),
      uColor1: uniform("uColor1"),
      uColor2: uniform("uColor2"),
      uColor3: uniform("uColor3")
    };

    const c1 = hexToRgb(color1);
    const c2 = hexToRgb(color2);
    const c3 = hexToRgb(color3);

    const setUniforms = () => {
      gl.uniform1f(uniforms.uTimeSpeed, timeSpeed);
      gl.uniform1f(uniforms.uColorBalance, colorBalance);
      gl.uniform1f(uniforms.uWarpStrength, warpStrength);
      gl.uniform1f(uniforms.uWarpFrequency, warpFrequency);
      gl.uniform1f(uniforms.uWarpSpeed, warpSpeed);
      gl.uniform1f(uniforms.uWarpAmplitude, warpAmplitude);
      gl.uniform1f(uniforms.uBlendAngle, blendAngle);
      gl.uniform1f(uniforms.uBlendSoftness, blendSoftness);
      gl.uniform1f(uniforms.uRotationAmount, rotationAmount);
      gl.uniform1f(uniforms.uNoiseScale, noiseScale);
      gl.uniform1f(uniforms.uGrainAmount, grainAmount);
      gl.uniform1f(uniforms.uGrainScale, grainScale);
      gl.uniform1f(uniforms.uGrainAnimated, grainAnimated ? 1 : 0);
      gl.uniform1f(uniforms.uContrast, contrast);
      gl.uniform1f(uniforms.uGamma, gamma);
      gl.uniform1f(uniforms.uSaturation, saturation);
      gl.uniform2f(uniforms.uCenterOffset, centerX, centerY);
      gl.uniform1f(uniforms.uZoom, zoom);
      gl.uniform3f(uniforms.uColor1, c1[0], c1[1], c1[2]);
      gl.uniform3f(uniforms.uColor2, c2[0], c2[1], c2[2]);
      gl.uniform3f(uniforms.uColor3, c3[0], c3[1], c3[2]);
    };

    let frame = 0;
    let lastRenderTime = 0;
    let needsResize = true;
    let isPageVisible = !document.hidden;
    const start = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniforms.iResolution, width, height);
      needsResize = false;
    };

    const render = (time) => {
      if (isPageVisible && time - lastRenderTime >= 33) {
        if (needsResize) resize();
        gl.useProgram(program);
        setUniforms();
        gl.uniform1f(uniforms.iTime, (time - start) * 0.001);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        lastRenderTime = time;
      }
      frame = requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const onVisibilityChange = () => {
      isPageVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [
    color1,
    color2,
    color3,
    timeSpeed,
    colorBalance,
    warpStrength,
    warpFrequency,
    warpSpeed,
    warpAmplitude,
    blendAngle,
    blendSoftness,
    rotationAmount,
    noiseScale,
    grainAmount,
    grainScale,
    grainAnimated,
    contrast,
    gamma,
    saturation,
    centerX,
    centerY,
    zoom
  ]);

  return h("canvas", {
    ref: canvasRef,
    className: ("grainient-container " + className).trim(),
    "aria-hidden": "true"
  });
}

const navItems = [
  ["经历", "#journey"],
  ["项目", "#projects"],
  ["其他作品", "#resume"],
  ["优势", "#strengths"],
  ["联系", "#contact"]
];

const stats = [
  { value: "VI", label: "品牌视觉全案经验" },
  { value: "AI", label: "Agent 工作流搭建经验" },
  { value: "3年", label: "品牌视觉设计经验" },
  { value: "25岁", label: "视觉传达本科经历" }
];

const timeline = [
  {
    year: "2025.07 - 2026.09",
    title: "河北佰赞企业管理 · 设计师",
    detail: "负责多家客户公司 VI 体系全案搭建并落地，参与品牌营销视觉方案策划；完成客户会议场控、物料设计及安排与课程文件制作。"
  },
  {
    year: "2024.11 - 2025.06",
    title: "河北千尔万广告 · 活动设计、执行",
    detail: "参与完成 30+ 场商业活动，主导 2 个大型展厅视觉设计；完成主 KV、现场物料、宣传手册、文化墙输出，把控打样与现场落地。"
  },
  {
    year: "2023.11 - 2024.03",
    title: "北京高途教育集团 · 设计师（实习）",
    detail: "负责公职考试课程品牌营销物料视觉设计；参与官网课程卡片、Banner、弹窗与专题页面视觉迭代优化，提升页面观感与浏览体验。"
  }
];

const projectPages = (slug, count) =>
  Array.from(
    { length: count },
    (_, index) =>
      "./public/assets/projects/" + slug + "/page-" + String(index + 1).padStart(2, "0") + ".jpg"
  );

const projects = [
  {
    title: "每的生鲜 · 品牌宣传手册",
    subtitle: "Brand Manual / 29P",
    description:
      "为每的生鲜梳理品牌视觉体系并落地，覆盖品牌标识、色彩与字体规范、门店物料与线上传播的完整应用。",
    tags: ["品牌手册", "VI 应用规范", "物料设计"],
    cover: "./public/assets/projects/meidi/cover.jpg",
    pages: projectPages("meidi", 29)
  },
  {
    title: "PALM PLAN · 品牌设计提案",
    subtitle: "Brand Proposal / 14P",
    description:
      "以美式复古小酒馆为基调，从项目背景、人群切口到品牌理念与视觉落地，完整输出 PALM PLAN 的品牌调性与应用体系。",
    tags: ["品牌策略", "美式复古", "视觉提案"],
    cover: "./public/assets/projects/palm/cover.jpg",
    pages: projectPages("palm", 14)
  },
  {
    title: "BLACK FLAG · 品牌与空间视觉",
    subtitle: "Brand & Space / Lowrider",
    description:
      "围绕 Lowrider 低趴车文化搭建咖啡与酒馆的品牌视觉，延伸至 Logo 变体、周边物料与门店空间渲染的完整呈现。",
    tags: ["品牌视觉", "空间渲染", "周边物料"],
    cover: "./public/assets/projects/blackflag/cover.jpg",
    pages: projectPages("blackflag", 1)
  }
];

const works = [
  {
    title: "活动视觉设计",
    subtitle: "Campaign / Event Visual",
    description:
      "从活动主视觉、现场物料到执行落地的完整输出，覆盖商业报告会、银行节点活动等场景，兼顾品牌调性与现场呈现。",
    tags: ["活动主视觉", "现场物料", "活动执行"],
    thumbs: [
      "./public/assets/works/event/thumb-1.jpg",
      "./public/assets/works/event/thumb-2.jpg",
      "./public/assets/works/event/thumb-3.jpg",
    ],
    items: [
      { type: "image", src: "./public/assets/works/event/p01.jpg", label: "投资策略报告会 · 活动主视觉" },
      { type: "image", src: "./public/assets/works/event/p02.jpg", label: "活动现场主视觉 01" },
      { type: "image", src: "./public/assets/works/event/p03.jpg", label: "活动现场主视觉 02" },
      { type: "image", src: "./public/assets/works/event/p04.jpg", label: "郎酒活动视觉" },
      { type: "video", src: "./public/assets/works/event/p05.mp4", label: "招商银行中秋之夜 · 活动记录（视频）" },
      { type: "video", src: "./public/assets/works/event/p06.mp4", label: "投资策略报告会 · 现场记录（视频）" },
    ]
  },
  {
    title: "AI 设计作品",
    subtitle: "AI Generated Visual",
    description:
      "用 AI 生成结合后期编排推进概念海报与产品视觉，从提示词、构图到版式与文案完整落地，用于快速验证并放大创意方向。",
    tags: ["AIGC", "概念海报", "产品视觉"],
    thumbs: [
      "./public/assets/works/ai/thumb-1.jpg",
      "./public/assets/works/ai/thumb-2.jpg",
      "./public/assets/works/ai/thumb-3.jpg",
    ],
    items: [
      { type: "image", src: "./public/assets/works/ai/p01.jpg", label: "春节 · 节日主视觉" },
      { type: "image", src: "./public/assets/works/ai/p02.jpg", label: "端午 · 节日主视觉" },
      { type: "image", src: "./public/assets/works/ai/p03.jpg", label: "AI-Driven · 概念海报" },
      { type: "image", src: "./public/assets/works/ai/p04.jpg", label: "LET ME GROW · 概念海报" },
      { type: "image", src: "./public/assets/works/ai/p05.jpg", label: "In Bloom · 概念海报" },
      { type: "image", src: "./public/assets/works/ai/p06.jpg", label: "键盘产品 · 概念海报" },
      { type: "image", src: "./public/assets/works/ai/p07.jpg", label: "夏至 · 节气海报" },
      { type: "image", src: "./public/assets/works/ai/p08.jpg", label: "大雪 · 节气海报" },
      { type: "image", src: "./public/assets/works/ai/p09.jpg", label: "清明 · 节气海报" },
      { type: "image", src: "./public/assets/works/ai/p10.jpg", label: "避风塘炒蟹 · 餐饮海报" },
      { type: "image", src: "./public/assets/works/ai/p11.jpg", label: "黄山烧饼 · 餐饮海报" },
      { type: "image", src: "./public/assets/works/ai/p12.jpg", label: "私藏一片海 · 产品海报" },
      { type: "image", src: "./public/assets/works/ai/p13.jpg", label: "贩卖晚安 · 产品海报" },
    ]
  },
  {
    title: "其他设计作品",
    subtitle: "Landing Page / Detail Page",
    description:
      "以长图为主的信息型设计输出，覆盖课程详情页、产品落地页与活动长图，从卖点分层、版式节奏到阅读体验的完整呈现。",
    tags: ["落地页", "详情长图", "版式设计"],
    wall: true,
    thumbs: [
      "./public/assets/works/other/thumb-1.jpg",
      "./public/assets/works/other/thumb-2.jpg",
      "./public/assets/works/other/thumb-3.jpg",
    ],
    items: [
      { type: "image", src: "./public/assets/works/other/full-1.jpg", thumb: "./public/assets/works/other/wall-1.jpg", label: "招商银行脉冲图 01" },
      { type: "image", src: "./public/assets/works/other/full-2.jpg", thumb: "./public/assets/works/other/wall-2.jpg", label: "招商银行脉冲图 02" },
      { type: "image", src: "./public/assets/works/other/full-3.jpg", thumb: "./public/assets/works/other/wall-3.jpg", label: "招商银行脉冲图 03" },
      { type: "image", src: "./public/assets/works/other/full-4.jpg", thumb: "./public/assets/works/other/wall-4.jpg", label: "招商银行脉冲图 04" },
      { type: "image", src: "./public/assets/works/other/full-5.jpg", thumb: "./public/assets/works/other/wall-5.jpg", label: "落地页长图" },
      { type: "image", src: "./public/assets/works/other/full-6.jpg", thumb: "./public/assets/works/other/wall-6.jpg", label: "落地页 · 首屏视觉" },
      { type: "image", src: "./public/assets/works/other/full-7.jpg", thumb: "./public/assets/works/other/wall-7.jpg", label: "产品详情页 01" },
      { type: "image", src: "./public/assets/works/other/full-8.jpg", thumb: "./public/assets/works/other/wall-8.jpg", label: "产品详情页 02" }
    ]
  }
];

const strengths = [
  {
    title: "品牌视觉系统",
    label: "Brand Visual System",
    text: "具备品牌 VI 体系、品牌手册与招商手册设计经验，能从品牌策略出发统一标识、标准色、字体与应用规范。",
    mediaType: "video",
    media: "./public/assets/strength-brand.mp4",
    poster: "./public/assets/strength-brand-poster.jpg"
  },
  {
    title: "海报与字体版式",
    label: "Poster / Typography",
    text: "擅长海报设计、字体设计与版式编排，注重视觉冲击力、信息层级与传播效率，适配线上线下多场景使用。",
    mediaType: "image",
    media: "./public/assets/resume-preview.webp"
  },
  {
    title: "策划落地能力",
    label: "Planning / Delivery",
    text: "具备方案流程设计经验，熟悉各类器材使用；擅长对接业务、客户与施工方，兼顾品牌调性、落地可行性与传播效果。",
    mediaType: "video",
    media: "./public/assets/works/event/p06.mp4",
    poster: "./public/assets/strength-planning-poster.jpg"
  },
  {
    title: "其他技能",
    label: "Other Skills",
    text: "掌握 AIGC、插画板绘、摄影、3D 建模与 Agent 工作流开发，能够辅助品牌视觉从创意到落地的完整链路。",
    mediaType: "video",
    media: "./public/assets/hero-background.mp4",
    poster: "./public/assets/strength-skills-poster.jpg"
  }
];

function sectionLabel(label, index) {
  return h(
    "div",
    { className: "section-label" },
    h("span", null, index),
    h("p", null, label)
  );
}

function PortfolioMotion() {
  useEffect(() => {
    const BREATHING = 14;

    const limitFor = (el) => {
      const holder = el.parentElement;
      if (!holder) return window.innerWidth - 32;
      const holderRect = holder.getBoundingClientRect();
      const next = holder.nextElementSibling;
      if (next) {
        const nextRect = next.getBoundingClientRect();
        if (nextRect.width > 0 && nextRect.left > holderRect.left + 24) {
          return nextRect.left;
        }
      }
      const shell = el.closest(".shell");
      const shellRight = shell
        ? shell.getBoundingClientRect().right
        : window.innerWidth - 32;
      const holderRight = holderRect.left + (holder.offsetWidth || holderRect.width);
      return Math.min(shellRight, holderRight);
    };

    const fitTitles = () => {
      const nodes = Array.from(document.querySelectorAll(".section-title-en"));
      if (!nodes.length) return;
      const samples = nodes.map((el) => {
        const previousFont = el.style.fontSize;
        const previousTransform = el.style.transform;
        el.style.fontSize = "";
        el.style.transform = "none";
        const baseSize = parseFloat(getComputedStyle(el).fontSize) || 120;
        const range = document.createRange();
        range.selectNodeContents(el);
        const textWidth = range.getBoundingClientRect().width;
        const left = el.getBoundingClientRect().left;
        const limit = limitFor(el);
        el.style.fontSize = previousFont;
        el.style.transform = previousTransform;
        return { el, baseSize, textWidth, left, limit };
      });
      samples.forEach(({ el, baseSize, textWidth, left, limit }) => {
        const available = limit - left - BREATHING;
        if (!textWidth || available <= 0 || textWidth <= available) return;
        const size = Math.max(34, Math.round((baseSize * available) / textWidth));
        el.style.fontSize = size + "px";
      });
    };

    let raf = 0;
    const schedule = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        fitTitles();
      });
    };

    schedule();
    const timers = [900, 2200, 4200].map((delay) => window.setTimeout(schedule, delay));
    window.addEventListener("resize", schedule);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(schedule).catch(() => {});
    }

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", schedule);
    };
  }, []);

  useEffect(() => {
    const setupLazyVideos = () => {
      const videos = Array.from(document.querySelectorAll("video[data-src]"));
      if (!videos.length) return () => {};

      const loadVideo = (video) => {
        if (video.dataset.loaded === "true") return;
        video.src = video.dataset.src;
        video.dataset.loaded = "true";
        video.load();
        video.play().catch(() => {});
      };

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          loadVideo(entry.target);
          observer.unobserve(entry.target);
        });
      }, { rootMargin: "500px 0px" });

      videos.forEach((video) => observer.observe(video));
      return () => observer.disconnect();
    };
    const cleanupLazyVideos = setupLazyVideos();

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    const originalScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    document.documentElement.classList.add("is-opening");
    window.scrollTo(0, 0);
    const topLock = window.setInterval(() => window.scrollTo(0, 0), 80);
    const releaseTopLock = window.setTimeout(() => {
      window.clearInterval(topLock);
      document.documentElement.classList.remove("is-opening");
      document.documentElement.style.scrollBehavior = originalScrollBehavior;
    }, 2850);

    const runNativeMotion = () => {
      const animate = (target, keyframes, options) => {
        if (!target) return null;
        return target.animate(keyframes, { fill: "both", ...options });
      };
      const sectionObservers = [];
      const opening = document.querySelector(".opening-panel");
      const slit = document.querySelector(".opening-slit");
      const lines = document.querySelectorAll(".opening-line");
      const titleLines = document.querySelectorAll(".hero-title-line");
      const heroItems = document.querySelectorAll(".topbar, .hero-kicker-row, .hero-impact, .hero-copy, .hero-actions, .hero-side-note");

      opening.style.opacity = "1";
      animate(slit, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 1050, easing: "cubic-bezier(.87,0,.13,1)" });
      lines.forEach((line, index) => {
        animate(line, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
          duration: 900,
          delay: 170 + index * 110,
          easing: "cubic-bezier(.87,0,.13,1)"
        });
      });

      titleLines.forEach((line) => {
        line.style.transform = "translateY(118%) scaleY(0.58)";
        line.style.opacity = "0";
      });
      heroItems.forEach((item) => {
        item.style.transform = "translateY(58px)";
        item.style.opacity = "0";
      });

      setTimeout(() => {
        const openingAnimation = animate(opening, [{ transform: "translateY(0%)" }, { transform: "translateY(-102%)" }], {
          duration: 1200,
          easing: "cubic-bezier(.87,0,.13,1)"
        });
        if (openingAnimation) {
          openingAnimation.onfinish = () => {
            opening.style.visibility = "hidden";
          };
        }
        animate(document.querySelector(".hero-video"), [
          { transform: "scale(1.18)", filter: "grayscale(0.55) saturate(0.55) contrast(1.2) brightness(0.38)" },
          { transform: "scale(1.08)", filter: "grayscale(0.32) saturate(0.86) contrast(1.08) brightness(0.6)" }
        ], { duration: 1650, easing: "cubic-bezier(.16,1,.3,1)" });
      }, 980);

      titleLines.forEach((line, index) => {
        animate(line, [
          { transform: "translateY(118%) scaleY(0.58)", opacity: 0 },
          { transform: "translateY(0%) scaleY(1)", opacity: 1 }
        ], { duration: 1350, delay: 1300 + index * 140, easing: "cubic-bezier(.16,1,.3,1)" });
      });
      heroItems.forEach((item, index) => {
        animate(item, [
          { transform: "translateY(58px)", opacity: 0 },
          { transform: "translateY(0)", opacity: 1 }
        ], { duration: 1050, delay: 1780 + index * 80, easing: "cubic-bezier(.16,1,.3,1)" });
      });

      document.querySelectorAll(".motion-section").forEach((section) => {
        const observer = new IntersectionObserver(([entry]) => {
          if (!entry.isIntersecting) return;
          const title = section.querySelector(".section-title-en");
          const introItems = section.querySelectorAll(".section-label, .section-intro h2, .section-intro > p:not(.section-title-en)");
          const cards = section.querySelectorAll(".portrait-card, .journey-panel, .project-card, .strength-card, .contact-actions a");
          animate(title, [
            { transform: "translate(-18%, 90px) scaleX(0.72)", opacity: 0, clipPath: "inset(0 100% 0 0)" },
            { transform: "translate(0, 0) scaleX(1)", opacity: 1, clipPath: "inset(0 0% 0 0)" }
          ], { duration: 1250, easing: "cubic-bezier(.16,1,.3,1)" });
          introItems.forEach((item, index) => {
            animate(item, [
              { transform: "translateY(42px)", opacity: 0, clipPath: "inset(0 0 100% 0)" },
              { transform: "translateY(0)", opacity: 1, clipPath: "inset(0 0 0% 0)" }
            ], { duration: 950, delay: 160 + index * 90, easing: "cubic-bezier(.16,1,.3,1)" });
          });
          cards.forEach((card, index) => {
            animate(card, [
              { transform: "translateY(82px) scale(.975)", opacity: 0, clipPath: "inset(16% 0 0 0)" },
              { transform: "translateY(0) scale(1)", opacity: 1, clipPath: "inset(0% 0 0 0)" }
            ], { duration: 1100, delay: 280 + index * 120, easing: "cubic-bezier(.16,1,.3,1)" });
          });
          observer.unobserve(section);
        }, { threshold: 0.18, rootMargin: "0px 0px -10% 0px" });
        observer.observe(section);
        sectionObservers.push(observer);
      });

      const parallaxItems = Array.from(document.querySelectorAll(".portrait-card img, .project-visual img, .strength-media img, .strength-media video"));
      let scrollFrame = 0;
      const updateParallax = () => {
        scrollFrame = 0;
        parallaxItems.forEach((item) => {
          const rect = item.getBoundingClientRect();
          const progress = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)));
          const y = 10 - progress * 18;
          item.style.transform = `translateY(${y}px) scale(1.055)`;
        });
      };
      const onScroll = () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(updateParallax);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      updateParallax();

      return () => {
        window.clearInterval(topLock);
        window.clearTimeout(releaseTopLock);
        cleanupLazyVideos();
        sectionObservers.forEach((observer) => observer.disconnect());
        window.removeEventListener("scroll", onScroll);
        if (scrollFrame) cancelAnimationFrame(scrollFrame);
        document.documentElement.classList.remove("is-opening");
        document.documentElement.style.scrollBehavior = originalScrollBehavior;
        if ("scrollRestoration" in window.history) {
          window.history.scrollRestoration = "auto";
        }
      };
    };

    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    if (!gsap || !ScrollTrigger) return runNativeMotion();

    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const ease = "power4.out";

      gsap.set(".opening-panel", { opacity: 1 });
      gsap.set(".opening-slit", { scaleX: 0 });
      gsap.set(".opening-line", { scaleX: 0, transformOrigin: "left center" });
      gsap.set(".hero-video", { scale: 1.18, filter: "grayscale(0.55) saturate(0.55) contrast(1.2) brightness(0.38)" });
      gsap.set([".topbar", ".hero-kicker-row"], { y: -36, opacity: 0 });
      gsap.set(".hero-title-line", { yPercent: 118, scaleY: 0.58, opacity: 0 });
      gsap.set([".hero-copy", ".hero-actions", ".hero-impact", ".hero-side-note"], { y: 68, opacity: 0 });

      gsap
        .timeline({ defaults: { ease } })
        .to(".opening-slit", { scaleX: 1, duration: 1.05, ease: "expo.inOut" })
        .to(".opening-line", { scaleX: 1, duration: 0.9, stagger: 0.1, ease: "expo.inOut" }, "-=0.82")
        .to(".opening-panel", { yPercent: -102, duration: 1.2, ease: "expo.inOut" }, "-=0.34")
        .set(".opening-panel", { visibility: "hidden" })
        .to(".hero-video", {
          scale: 1.08,
          filter: "grayscale(0.32) saturate(0.86) contrast(1.08) brightness(0.6)",
          duration: 1.65
        }, "-=1.1")
        .to([".topbar", ".hero-kicker-row"], { y: 0, opacity: 1, duration: 1.1, stagger: 0.12 }, "-=1.05")
        .to(".hero-title-line", {
          yPercent: 0,
          scaleY: 1,
          opacity: 1,
          duration: 1.35,
          stagger: 0.14,
          ease: "expo.out"
        }, "-=0.82")
        .to([".hero-impact", ".hero-copy", ".hero-actions", ".hero-side-note"], {
          y: 0,
          opacity: 1,
          duration: 1.15,
          stagger: 0.12
        }, "-=0.75");

      gsap.utils.toArray(".motion-section").forEach((section) => {
        const title = section.querySelector(".section-title-en");
        const introItems = section.querySelectorAll(".section-label, .section-intro h2, .section-intro > p");
        const cards = section.querySelectorAll(".portrait-card, .journey-panel, .project-card, .strength-card, .contact-actions a");
        const media = section.querySelectorAll(".portrait-card img, .project-visual img, .strength-media img, .strength-media video");

        if (title) {
          gsap.fromTo(title,
            { xPercent: -18, y: 90, scaleX: 0.72, opacity: 0, clipPath: "inset(0 100% 0 0)" },
            {
              xPercent: 0,
              y: 0,
              scaleX: 1,
              opacity: 1,
              clipPath: "inset(0 0% 0 0)",
              duration: 1.25,
              ease: "expo.out",
              scrollTrigger: { trigger: section, start: "top 76%", once: true }
            }
          );
        }

        gsap.fromTo(introItems,
          { y: 42, opacity: 0, clipPath: "inset(0 0 100% 0)" },
          {
            y: 0,
            opacity: 1,
            clipPath: "inset(0 0 0% 0)",
            duration: 0.95,
            stagger: 0.1,
            ease,
            scrollTrigger: { trigger: section, start: "top 70%", once: true }
          }
        );

        gsap.fromTo(cards,
          { y: 82, opacity: 0, clipPath: "inset(16% 0 0 0)", scale: 0.975 },
          {
            y: 0,
            opacity: 1,
            clipPath: "inset(0% 0 0 0)",
            scale: 1,
            duration: 1.1,
            stagger: 0.14,
            ease,
            scrollTrigger: { trigger: section, start: "top 66%", once: true }
          }
        );

        media.forEach((item) => {
          gsap.fromTo(item,
            { yPercent: 9, scale: 1.12, clipPath: "inset(18% 0 18% 0)" },
            {
              yPercent: -4,
              scale: 1.04,
              clipPath: "inset(0% 0 0% 0)",
              ease: "none",
              scrollTrigger: {
                trigger: item,
                start: "top bottom",
                end: "bottom top",
                scrub: 0.7
              }
            }
          );
        });
      });
    });

    return () => {
      window.clearInterval(topLock);
      window.clearTimeout(releaseTopLock);
      cleanupLazyVideos();
      ctx.revert();
      document.documentElement.classList.remove("is-opening");
      document.documentElement.style.scrollBehavior = originalScrollBehavior;
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "auto";
      }
    };
  }, []);

  return null;
}

function heroSection() {
  return h(
    "section",
    { className: "hero", id: "top" },
    h(
      "div",
      { className: "hero-media" },
      h(
        "video",
        {
          className: "hero-video",
          autoPlay: true,
          muted: true,
          loop: true,
          playsInline: true,
          poster: "./public/assets/hero-poster.svg"
        },
        h("source", {
          src: "./public/assets/hero-background.mp4",
          type: "video/mp4"
        })
      ),
      h("div", { className: "hero-vignette" }),
      h("div", { className: "hero-noise" }),
      h("div", { className: "hero-gradient" })
    ),
    h("div", {
      className: "hero-lanyard",
      id: "widget-root",
      "aria-label": "可拖拽简历挂件"
    }),
    h(
      "div",
      { className: "shell hero-shell" },
      h(
        "header",
        { className: "topbar" },
        h(
          "a",
          { className: "brand", href: "#top" },
          h("span", { className: "brand-mark" }, "YX"),
          h("strong", null, "杨鑫晨")
        ),
        h(
          "nav",
          { className: "nav" },
          navItems.map(([label, href]) =>
            h("a", { key: label, href }, label)
          )
        ),
        h(
          "div",
          { className: "topbar-actions" },
          h(
            "a",
            { className: "contact-button", href: "mailto:2201771649@qq.com" },
            "联系我"
          ),
          h("span", { className: "hero-year" }, "[2026]")
        )
      ),
      h(
        "div",
        { className: "hero-content" },
        h(
          "div",
          { className: "hero-kicker-row" },
          h("p", { className: "eyebrow" }, "[Portfolio]"),
          h("p", { className: "hero-role" }, "Brand Design / Planning")
        ),

        h(
          "div",
          { className: "hero-lower" },
          h(
            "div",
            { className: "hero-main-copy" },
            h(
              "h1",
              { className: "hero-title", "aria-label": "Brand Design Planning" },
              h("span", { className: "hero-title-mask" }, h("span", { className: "hero-title-line" }, "BRAND")),
              h("span", { className: "hero-title-mask" }, h("span", { className: "hero-title-line" }, "PLANNING"))
            ),
            h(
              "p",
              { className: "hero-copy" },
              "我是杨鑫晨，专注品牌设计策划、营销物料、空间视觉导视，具备从策略构思、设计输出到落地跟进的完整项目经验。"
            ),
            h(
              "div",
              { className: "hero-actions" },
              h("a", { className: "primary-action", href: "#projects" }, "查看项目"),
              h(
                "a",
                {
                  className: "secondary-action",
                  href: "./public/assets/yangxinchen-resume.pdf",
                  download: "杨鑫晨-品牌设计策划-简历.pdf"
                },
                "下载简历"
              )
            )
          ),
          h(
            "div",
            { className: "hero-side-note" },
            h("span", null, "DESIGN IS NOT"),
            h("strong", null, "DECORATION"),
            h("p", null, "设计不是装饰，而是方向、判断与秩序。")
          )
        )
      )
    )
  );
}

function journeySection() {
  return h(
    "section",
    { className: "section motion-section", id: "journey" },
    h(
      "div",
      { className: "shell section-grid section-grid-wide" },
      h(
        "div",
        { className: "section-intro" },
        h("p", { className: "section-title-en" }, "Introduce"),
        sectionLabel("个人介绍", "01"),
        h("h2", null, "品牌设计策划的起点，是专业基础、执行经验和跨部门协作的叠加。"),
        h(
          "p",
          null,
          "从视觉传达专业到品牌与营销物料落地，我更关注设计结果背后的方法：如何让品牌表达更统一、让信息层级更清晰、让协作落地更高效。"
        )
      ),
      h(
        "div",
        { className: "journey-layout" },
        h(
          "div",
          { className: "portrait-card" },
          h("img", {
            src: "./public/assets/yangxinchen-portrait.png",
            alt: "杨鑫晨个人照片",
            loading: "lazy",
            decoding: "async"
          }),
          h(
            "div",
            { className: "portrait-meta" },
            h("strong", null, "杨鑫晨"),
            h("p", null, "意向职位：品牌设计 / 策划"),
            h(
              "div",
              { className: "contact-list" },
              h("a", { href: "tel:13223173648" }, "132 2317 3648"),
              h("a", { href: "mailto:2201771649@qq.com" }, "2201771649@qq.com"),
              h("span", null, "品牌设计 / 策划")
            )
          )
        ),
        h(
          "div",
          { className: "journey-panel" },
          h(
            "div",
            { className: "stats-grid" },
            stats.map((item) =>
              h(
                "article",
                { className: "stat-card", key: item.label },
                h("strong", null, item.value),
                h("p", null, item.label)
              )
            )
          ),
          h(
            "div",
            { className: "bio-card" },
            h("p", null, "设计软件"),
            h(
              "h3",
              null,
              "Photoshop / Illustrator / After Effects / InDesign / Figma / Stable Diffusion / C4D / Codex / 即梦"
            ),
            h(
              "p",
              { className: "bio-copy" },
              "擅长品牌策略搭建，AI 生成、二维视觉和三维空间之间切换的设计方式，用更高效的方式组织想法，并把它们转化为更接近真实项目的结果。"
            )
          ),
          h(
            "div",
            { className: "timeline" },
            timeline.map((item) =>
              h(
                "article",
                { className: "timeline-item", key: item.title },
                h("span", null, item.year),
                h(
                  "div",
                  null,
                  h("h4", null, item.title),
                  h("p", null, item.detail)
                )
              )
            )
          )
        )
      )
    )
  );
}

function projectsSection(onOpenProject) {
  return h(
    "section",
    { className: "section motion-section", id: "projects" },
    h(
      "div",
      { className: "shell section-grid" },
      h(
        "div",
        { className: "section-intro" },
        h("p", { className: "section-title-en" }, "Project"),
        sectionLabel("精选项目", "02"),
        h("p", null, "点击任意项目卡片，可查看完整项目详情。")
      ),
      h(
        "div",
        { className: "project-stack" },
        projects.map((project) =>
          h(
            "article",
            {
              className: "project-card project-card-clickable",
              key: project.title,
              role: "button",
              tabIndex: 0,
              "aria-label": "查看项目详情：" + project.title,
              onClick: () => onOpenProject(project),
              onKeyDown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenProject(project);
                }
              }
            },
            h(
              "div",
              { className: "project-copy" },
              h("p", { className: "project-subtitle" }, project.subtitle),
              h("h3", null, project.title),
              h("p", null, project.description),
              h(
                "div",
                { className: "tag-row" },
                project.tags.map((tag) => h("span", { key: tag }, tag))
              ),
              h(
                "span",
                { className: "project-detail-hint" },
                "点击查看详情",
                h("i", { "aria-hidden": "true" }, "→")
              )
            ),
            h(
              "div",
              { className: "project-visual" },
              h("img", {
                className: "project-cover",
                src: project.cover,
                alt: project.title + " 封面",
                loading: "lazy",
                decoding: "async"
              }),
              h(
                "span",
                { className: "project-page-count" },
                project.pages.length > 1 ? "共 " + project.pages.length + " 页" : "长图"
              )
            )
          )
        )
      )
    )
  );
}

function resumeSection(onOpenWork) {
  return h(
    "section",
    { className: "section motion-section", id: "resume" },
    h(
      "div",
      { className: "shell" },
      h(
        "div",
        { className: "resume-head" },
        h(
          "div",
          { className: "resume-head-copy" },
          h("p", { className: "section-title-en" }, "WORKS"),
          sectionLabel("其他作品", "03"),
          h(
            "h2",
            null,
            "3 年项目实战经验，打通从前期策略构思、视觉创作到项目落地跟进全流程。"
          ),
          h(
            "p",
            null,
            "专业活动策划落地与视觉设计，可独立完成品牌 VI、营销物料、AIGC 创意及页面版式设计，拥有完整项目落地经验。"
          )
        )
      ),
      h(
        "div",
        { className: "work-stack" },
        works.map((work, index) =>
          h(
            "article",
            {
              className: "work-panel",
              key: work.title,
              role: "button",
              tabIndex: 0,
              "aria-label": "查看作品详情：" + work.title,
              onClick: () => onOpenWork(work),
              onKeyDown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenWork(work);
                }
              }
            },
            h("span", { className: "work-panel-index" }, String(index + 1).padStart(2, "0")),
            h(
              "div",
              { className: "work-panel-copy" },
              h(
                "p",
                { className: "project-subtitle" },
                work.subtitle
              ),
              h("h3", null, work.title),
              h("p", null, work.description),
              h(
                "div",
                { className: "tag-row" },
                work.tags.map((tag) => h("span", { key: tag }, tag))
              ),
              h(
                "span",
                { className: "project-detail-hint" },
                "点击查看详情",
                h("i", { "aria-hidden": "true" }, "→")
              )
            ),
            h(
              "div",
              { className: "work-panel-thumbs" },
              work.thumbs.map((src) =>
                h("img", {
                  key: src,
                  src,
                  alt: work.title + " 预览",
                  loading: "lazy",
                  decoding: "async"
                })
              )
            )
          )
        )
      )
    )
  );
}

function strengthsSection() {
  const strengthCardClasses = [
    "strength-card strength-card-visual",
    "strength-card strength-card-space",
    "strength-card strength-card-model",
    "strength-card strength-card-collab"
  ];

  return h(
    "section",
    { className: "section motion-section", id: "strengths" },
    h(
      "div",
      { className: "shell section-grid" },
      h(
        "div",
        { className: "section-intro" },
        h("p", { className: "section-title-en" }, "Advantages"),
        sectionLabel("个人优势", "04"),
        h("h2", null, "不是单一工具使用者，而是能把视觉、空间与 AI 方法串起来的人。"),
        h(
          "p",
          null,
          "这一版先提炼四个核心能力，后续可以继续扩展成更完整的能力矩阵、服务范围或项目方法论。"
        )
      ),
      h(
        "div",
        { className: "strength-grid" },
        strengths.map((item, index) =>
          h(
            "article",
            { className: strengthCardClasses[index], key: item.title },
            item.mediaType
              ? h(
                  Fragment,
                  null,
                  h(
                    "div",
                    { className: "strength-media" },
                    item.mediaType === "video"
                      ? h(
                          "video",
                          {
                            autoPlay: true,
                            muted: true,
                            loop: true,
                            playsInline: true,
                            preload: "none",
                            poster: item.poster || "./public/assets/hero-poster.svg",
                            "data-src": item.media
                          },
                          null
                        )
                      : h("img", {
                          src: item.media,
                          alt: item.title + " 作品展示",
                          loading: "lazy",
                          decoding: "async"
                        }),
                    h("div", { className: "strength-media-overlay" }),
                    h("div", { className: "strength-media-noise" })
                  ),
                  h(
                    "div",
                    { className: "strength-card-content" },
                    h("p", { className: "strength-label" }, item.label),
                    h("span", null, item.title),
                    h("p", null, item.text)
                  )
                )
              : h(
                  "div",
                  { className: "strength-card-content strength-card-content-plain" },
                  h("p", { className: "strength-label" }, item.label),
                  h("span", null, item.title),
                  h("p", null, item.text)
                )
          )
        )
      )
    )
  );
}

function contactSection() {
  return h(
    "section",
    { className: "contact-section motion-section", id: "contact" },
    h(
      "div",
      { className: "shell contact-shell" },
      h("p", { className: "section-title-en contact-title-en" }, "CONTACT"),
      sectionLabel("联系我", "05"),
      h("p", { className: "contact-kicker" }, "求职意向：品牌设计 / 策划"),
      h(
        "h2",
        null,
        "如果你正在寻找一位能把品牌策略、视觉表达与项目落地结合起来的设计师，",
        h("br"),
        "我们可以开始聊合作。"
      ),
      h(
        "div",
        { className: "contact-actions" },
        h("a", { href: "mailto:2201771649@qq.com" }, "2201771649@qq.com"),
        h("a", { href: "tel:13223173648" }, "132 2317 3648")
      ),
      h("p", { className: "contact-footnote" }, "杨鑫晨 · Brand Design / Planning")
    )
  );
}

function ProjectDetailModal({ project, onClose, poster }) {
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return h(
    "div",
    {
      className: "project-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": project.title
    },
    h("div", { className: "project-modal-backdrop", onClick: onClose }),
    h(
      "div",
      { className: "project-modal-panel" },
      h(
        "div",
        { className: "project-modal-head" },
        h(
          "div",
          { className: "project-modal-heading" },
          h("p", { className: "project-subtitle" }, project.subtitle),
          h("h3", null, project.title),
          h("p", { className: "project-modal-desc" }, project.description),
          h(
            "div",
            { className: "tag-row" },
            project.tags.map((tag) => h("span", { key: tag }, tag))
          )
        ),
        h(
          "button",
          {
            className: "project-modal-close",
            type: "button",
            onClick: onClose,
            "aria-label": "关闭项目详情"
          },
          "×"
        )
      ),
      h(
        "div",
        { className: "project-modal-pages" + (poster ? " project-modal-pages-poster" : "") },
        project.pages.map((src, index) =>
          h("img", {
            key: src,
            src,
            alt: project.title + " 详情 " + (index + 1),
            loading: index < 2 ? "eager" : "lazy",
            decoding: "async"
          })
        )
      ),
      h(
        "p",
        { className: "project-modal-footnote" },
        (project.footnote ||
          (project.pages.length > 1 ? "共 " + project.pages.length + " 页 · " : "")) +
          "点击背景或按 Esc 关闭"
      )
    )
  );
}

function DriftWall({
  items,
  columns = 5,
  tileWidth = 244,
  tileHeight = 132,
  gap = 18,
  tilt = 16,
  turn = -14,
  perspective = 1200,
  depth = 120,
  speed = 42,
  direction = "up",
  variance = 0.45,
  parallax = 0.6,
  lift = 64,
  fade = 0.6,
  dim = 0.55,
  overlayColor = "#060010",
  radius = 21,
  onSelect,
  className,
  style,
  children
}) {
  const list = items && items.length ? items : [];
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const columnRefs = useRef([]);
  const [scale, setScale] = React.useState(1);
  const scaleRef = useRef(1);
  scaleRef.current = scale;
  const [seed] = React.useState(() => Math.floor(Math.random() * 100000) + 1);

  const buckets = React.useMemo(() => {
    const total = list.length;
    if (!total) return [];
    const noise = (seed) => {
      const value = Math.sin(seed * 12.9898) * 43758.5453;
      return value - Math.floor(value);
    };
    const order = list.map((entry, i) => i);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(noise(i * 4.77 + 2.31 + seed) * (i + 1));
      const swap = order[i];
      order[i] = order[j];
      order[j] = swap;
    }
    const base = Math.floor(total / columns);
    const remainder = total % columns;
    const groups = [];
    let cursor = 0;
    for (let c = 0; c < columns; c += 1) {
      const size = Math.max(1, base + (c < remainder ? 1 : 0));
      groups.push(order.slice(cursor, cursor + size));
      cursor += size;
    }
    return groups;
  }, [columns, list, seed]);

  const maxBucket = buckets.reduce(
    (max, bucket) => Math.max(max, bucket.length),
    1
  );
  const maxPeriod = maxBucket * (tileHeight + gap);
  const wallWidth = columns * tileWidth + (columns - 1) * gap;
  const stageHeight = maxPeriod * 2 - gap;

  const columnData = React.useMemo(() => {
    const noise = (seed) => {
      const value = Math.sin(seed * 12.9898) * 43758.5453;
      return value - Math.floor(value);
    };
    return Array.from({ length: columns }, (_, c) => {
      const bucket = buckets[c] && buckets[c].length ? buckets[c] : [0];
      const size = bucket.length;
      const period = size * (tileHeight + gap);
      const rotation = c % size;
      return {
        period,
        speed: speed * (1 + (noise(c * 7.13 + 1.7) - 0.5) * 2 * variance),
        phase:
          (((c * 0.41 + 0.17) % 1) + noise(c * 3.71 + 9.4) * 0.08) * period,
        z: -(c % 2) * depth,
        tiles: Array.from({ length: size * 2 }, (_, k) => {
          const itemIndex = bucket[(k % size + rotation) % size];
          return { key: c + "-" + k, item: list[itemIndex], itemIndex };
        })
      };
    });
  }, [buckets, columns, speed, variance, depth, tileHeight, gap, list]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const measure = () => {
      const width = host.clientWidth;
      if (width) setScale(Math.max(0.3, (width * 1.14) / wallWidth));
    };
    measure();
    window.addEventListener("resize", measure);
    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(host);
    }
    return () => {
      window.removeEventListener("resize", measure);
      if (observer) observer.disconnect();
    };
  }, [wallWidth]);

  useEffect(() => {
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!host || !stage || !columnData.length) return undefined;
    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let raf = 0;
    let start = 0;

    const handleMove = (event) => {
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      target.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      target.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    };
    const handleLeave = () => {
      target.x = 0;
      target.y = 0;
    };

    const frame = (now) => {
      if (!start) start = now;
      const elapsed = (now - start) / 1000;
      pointer.x += (target.x - pointer.x) * 0.06;
      pointer.y += (target.y - pointer.y) * 0.06;
      stage.style.transform =
        "translate(-50%, -50%) rotateX(" +
        (tilt - pointer.y * parallax * 8).toFixed(2) +
        "deg) rotateY(" +
        (turn + pointer.x * parallax * 10).toFixed(2) +
        "deg) scale(" +
        scaleRef.current.toFixed(4) +
        ")";
      columnRefs.current.forEach((element, index) => {
        if (!element) return;
        const column = columnData[index];
        if (!column) return;
        const raw = elapsed * column.speed + column.phase;
        const wrapped = ((raw % column.period) + column.period) % column.period;
        const offset =
          direction === "down"
            ? wrapped - column.period / 2
            : column.period / 2 - wrapped;
        element.style.transform =
          "translate3d(0px, " + offset.toFixed(2) + "px, " + column.z + "px)";
      });
      raf = window.requestAnimationFrame(frame);
    };

    host.addEventListener("pointermove", handleMove);
    host.addEventListener("pointerleave", handleLeave);
    raf = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", handleMove);
      host.removeEventListener("pointerleave", handleLeave);
    };
  }, [columnData, tilt, turn, parallax]);

  if (!list.length) return null;

  const overlayRgb = hexToRgb(overlayColor)
    .map((channel) => Math.round(channel * 255))
    .join(", ");
  const edge = Math.max(0, Math.min(0.5, fade * 0.5)) * 100;

  return h(
    "div",
    {
      className: "drift-wall" + (className ? " " + className : ""),
      ref: hostRef,
      style: Object.assign({ perspective: perspective + "px" }, style)
    },
    h(
      "div",
      {
        className: "drift-wall-stage",
        ref: stageRef,
        style: {
          width: wallWidth + "px",
          height: stageHeight + "px",
          transform:
            "translate(-50%, -50%) rotateX(" + tilt + "deg) rotateY(" + turn + "deg)"
        }
      },
      columnData.map((column, index) =>
        h(
          "div",
          {
            className: "drift-wall-column",
            key: "drift-column-" + index,
            ref: (element) => {
              columnRefs.current[index] = element;
            },
            style: { left: index * (tileWidth + gap) + "px", width: tileWidth + "px" }
          },
          column.tiles.map((tile) =>
            h(
              onSelect ? "button" : "a",
              {
                key: tile.key,
                className: "drift-tile",
                type: onSelect ? "button" : undefined,
                href: onSelect ? undefined : tile.item.href,
                target: onSelect ? undefined : "_blank",
                rel: onSelect ? undefined : "noreferrer",
                onClick: onSelect
                  ? () => onSelect(tile.itemIndex, tile.item)
                  : undefined,
                title: tile.item.title,
                "aria-label": tile.item.title,
                style: {
                  width: tileWidth + "px",
                  height: tileHeight + "px",
                  marginBottom: gap + "px",
                  borderRadius: radius + "px",
                  "--drift-lift": lift + "px"
                }
              },
              tile.item.video
                ? h("video", {
                    className: "drift-tile-media",
                    src: tile.item.image,
                    muted: true,
                    playsInline: true,
                    preload: "metadata",
                    "aria-hidden": "true"
                  })
                : h("img", {
                    className: "drift-tile-media",
                    src: tile.item.image,
                    alt: tile.item.title || "",
                    loading: "lazy",
                    decoding: "async",
                    draggable: "false"
                  }),
              tile.item.video
                ? h("span", { className: "drift-tile-badge", "aria-hidden": "true" }, "▶")
                : null,
              tile.item.title
                ? h("span", { className: "drift-tile-label" }, tile.item.title)
                : null
            )
          )
        )
      )
    ),
    dim > 0
      ? h("div", {
          className: "drift-wall-dim",
          style: { background: overlayColor, opacity: dim }
        })
      : null,
    edge > 0
      ? h("div", {
          className: "drift-wall-fade drift-wall-fade-top",
          style: {
            background:
              "linear-gradient(180deg, rgba(" + overlayRgb + ", 1) 0%, rgba(" + overlayRgb + ", 0) 100%)",
            height: edge + "%"
          }
        })
      : null,
    edge > 0
      ? h("div", {
          className: "drift-wall-fade drift-wall-fade-bottom",
          style: {
            background:
              "linear-gradient(0deg, rgba(" + overlayRgb + ", 1) 0%, rgba(" + overlayRgb + ", 0) 100%)",
            height: edge + "%"
          }
        })
      : null,
    children || null
  );
}

function WorkGrid({ items, onOpen, gap = 12 }) {
  const hostRef = useRef(null);
  const [layout, setLayout] = React.useState({
    columns: 4,
    tileWidth: 200,
    tileHeight: 112
  });

  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const compute = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      const count = items.length || 1;
      if (!width || !height) return;
      const aspect = 16 / 9;
      let best = null;
      for (let columns = 1; columns <= count; columns += 1) {
        const rows = Math.ceil(count / columns);
        const cellWidth = (width - gap * (columns - 1)) / columns;
        const cellHeight = (height - gap * (rows - 1)) / rows;
        const tileWidth = Math.min(cellWidth, cellHeight * aspect);
        if (tileWidth > 48 && (!best || tileWidth > best.tileWidth)) {
          best = { columns, tileWidth, tileHeight: tileWidth / aspect };
        }
      }
      if (best) {
        setLayout({
          columns: best.columns,
          tileWidth: Math.floor(best.tileWidth),
          tileHeight: Math.floor(best.tileHeight)
        });
      }
    };
    compute();
    window.addEventListener("resize", compute);
    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(compute);
      observer.observe(host);
    }
    return () => {
      window.removeEventListener("resize", compute);
      if (observer) observer.disconnect();
    };
  }, [items, gap]);

  return h(
    "div",
    { className: "work-grid-host", ref: hostRef },
    h(
      "div",
      {
        className: "work-grid",
        style: {
          gridTemplateColumns:
            "repeat(" + layout.columns + ", " + layout.tileWidth + "px)",
          gap: gap + "px"
        }
      },
      items.map((item, itemIndex) =>
        h(
          "button",
          {
            className: "work-tile",
            key: item.src + "-" + itemIndex,
            type: "button",
            style: {
              width: layout.tileWidth + "px",
              height: layout.tileHeight + "px"
            },
            onClick: () => onOpen(itemIndex),
            "aria-label": "查看详情：" + (item.label || "")
          },
          item.type === "video"
            ? h("video", {
                className: "work-tile-media",
                src: item.src,
                preload: "metadata",
                muted: true,
                playsInline: true
              })
            : h("img", {
                className: "work-tile-media",
                src: item.src,
                alt: item.label || "",
                loading: "lazy",
                decoding: "async"
              }),
          item.type === "video"
            ? h("span", { className: "work-tile-badge", "aria-hidden": "true" }, "▶")
            : null,
          h("span", { className: "work-tile-label" }, item.label || work_labelFallback(item))
        )
      )
    )
  );
}

function work_labelFallback(item) {
  return item.type === "video" ? "视频作品" : "图片作品";
}

function WorkDetailModal({ work, onClose }) {
  const total = work.items.length;
  const [index, setIndex] = React.useState(0);
  const [mode, setMode] = React.useState("grid");
  const [tallMedia, setTallMedia] = React.useState(false);
  const go = (delta) =>
    setIndex((current) => Math.min(total - 1, Math.max(0, current + delta)));
  const openItem = (target) => {
    setIndex(Math.min(total - 1, Math.max(0, target)));
    setMode("single");
  };

  const wallItems = React.useMemo(() => {
    return work.items.map((item, itemIndex) => ({
      image: item.thumb || item.src,
      video: item.type === "video",
      title: item.label || work.title,
      href: item.src,
      index: itemIndex
    }));
  }, [work]);

  React.useEffect(() => {
    setTallMedia(false);
  }, [index, mode]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") {
        if (mode === "single") {
          setMode("grid");
        } else {
          onClose();
        }
        return;
      }
      if (mode !== "single") return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, total, mode]);

  const current = work.items[index];
  const showWall = wallItems.length > 0;

  return h(
    "div",
    {
      className: "project-modal work-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": work.title
    },
    h("div", { className: "project-modal-backdrop", onClick: onClose }),
    h(
      "div",
      {
        className:
          "project-modal-panel work-modal-panel" +
          (mode === "grid" ? " work-modal-grid" : " work-modal-single") +
          (mode === "grid" && showWall ? " has-wall" : "")
      },
      h(
        "div",
        { className: "project-modal-head" },
        h(
          "div",
          { className: "project-modal-heading" },
          h("p", { className: "project-subtitle" }, work.subtitle),
          h("h3", null, work.title),
          h("p", { className: "project-modal-desc" }, work.description),
          h(
            "div",
            { className: "tag-row" },
            work.tags.map((tag) => h("span", { key: tag }, tag))
          )
        ),
        h(
          "button",
          {
            className: "project-modal-close",
            type: "button",
            onClick: onClose,
            "aria-label": "关闭作品详情"
          },
          "×"
        )
      ),
      mode === "grid" && showWall
        ? h(
            "div",
            { className: "work-wall" },
            h(
              DriftWall,
              {
                items: wallItems,
                columns: Math.max(2, Math.min(5, Math.floor(work.items.length / 4))),
                tileWidth: 244,
                tileHeight: 132,
                gap: 18,
                tilt: 16,
                turn: -14,
                perspective: 1200,
                depth: 120,
                speed: 42,
                direction: "up",
                variance: 0.45,
                parallax: 0.6,
                lift: 64,
                fade: 0,
                dim: 0,
                overlayColor: "#060010",
                radius: 21,
                onSelect: (listIndex, tile) =>
                  openItem(tile && typeof tile.index === "number" ? tile.index : listIndex)
              }
            )
          )
        : null,
      mode === "grid" && !showWall
        ? h(WorkGrid, {
            items: work.items,
            gap: 12,
            onOpen: openItem
          })
        : null,
      mode !== "grid"
        ? h(
        "div",
        { className: "work-viewer" },
        h(
          "button",
          {
            className: "work-nav work-nav-prev",
            type: "button",
            onClick: () => go(-1),
            disabled: index === 0,
            "aria-label": "上一个作品"
          },
          "‹"
        ),
        h(
          "div",
          { className: "work-stage" + (tallMedia ? " work-stage-scroll" : "") },
          current.type === "video"
            ? h("video", {
                key: current.src,
                className: "work-stage-media",
                src: current.src,
                controls: true,
                autoPlay: true,
                playsInline: true,
                preload: "metadata"
              })
            : h("img", {
                key: current.src,
                className: "work-stage-media",
                src: current.src,
                alt: work.title + " · " + current.label,
                decoding: "async",
                onLoad: (event) => {
                  const node = event.currentTarget;
                  setTallMedia(
                    node.naturalWidth > 0 &&
                      node.naturalHeight / node.naturalWidth > 1.35
                  );
                }
              })
        ),
        h(
          "button",
          {
            className: "work-nav work-nav-next",
            type: "button",
            onClick: () => go(1),
            disabled: index === total - 1,
            "aria-label": "下一个作品"
          },
          "›"
        )
          )
        : null,
      h(
        "div",
        { className: "work-viewer-bar" },
        mode === "grid"
          ? h(
              "div",
              { className: "work-viewer-meta" },
              h(
                "span",
                { className: "work-viewer-label" },
                "共 " + total + " 个作品 · 点击任意图片查看详情"
              ),
              h(
                "span",
                { className: "work-viewer-count" },
                String(total).padStart(2, "0") + " 件"
              )
            )
          : h(
              "div",
              { className: "work-viewer-meta" },
              h(
                "div",
                { className: "work-viewer-meta-left" },
                h(
                  "button",
                  {
                    className: "work-back",
                    type: "button",
                    onClick: () => setMode("grid")
                  },
                  "← 全部作品"
                ),
                h(
                  "span",
                  { className: "work-viewer-label" },
                  current.label || work.title
                )
              ),
              h("span", { className: "work-viewer-count" }, index + 1 + " / " + total)
            ),
        mode === "grid"
          ? null
          : h(
              "div",
              { className: "work-viewer-progress" },
              h("i", { style: { width: ((index + 1) / total) * 100 + "%" } })
            )
      ),
      h(
        "p",
        { className: "project-modal-footnote" },
        mode === "grid"
          ? "点击任意图片查看详情 · 点击背景或按 Esc 关闭"
          : (tallMedia ? "滚轮滚动查看完整长图 · " : "") +
            "← → 切换作品 · 点击「全部作品」或按 Esc 返回列表"
      )
    )
  );
}

function App() {
  const [activeProject, setActiveProject] = React.useState(null);
  const [activeWork, setActiveWork] = React.useState(null);

  return h(
    Fragment,
    null,
    h(PortfolioMotion),
    h(
      "div",
      { className: "opening-panel", "aria-hidden": "true" },
      h("div", { className: "opening-slit" }),
      h("span", { className: "opening-line opening-line-top" }),
      h("span", { className: "opening-line opening-line-bottom" })
    ),
    heroSection(),
    h(
      "main",
      { className: "site-body" },
      h(Grainient, {
        className: "site-body-grainient",
        color1: "#44110d",
        color2: "#24272c",
        color3: "#050711",
        timeSpeed: 0.14,
        warpStrength: 0.72,
        warpFrequency: 3.8,
        warpAmplitude: 82,
        rotationAmount: 420,
        grainAmount: 0.16,
        contrast: 1.28,
        saturation: 0.78,
        centerX: -0.06,
        centerY: 0.02,
        zoom: 0.78
      }),
      h("div", { className: "site-body-vignette" }),
      journeySection(),
      projectsSection(setActiveProject),
      resumeSection(setActiveWork),
      strengthsSection(),
      contactSection()
    ),
    activeProject
      ? h(ProjectDetailModal, {
          project: activeProject,
          onClose: () => setActiveProject(null)
        })
      : null,
    activeWork
      ? h(WorkDetailModal, {
          work: activeWork,
          onClose: () => setActiveWork(null)
        })
      : null
  );
}

createRoot(document.getElementById("root")).render(h(App));
