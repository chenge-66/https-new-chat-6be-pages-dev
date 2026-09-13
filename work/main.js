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
  ["优势", "#strengths"],
  ["联系", "#contact"]
];

const stats = [
  { value: "2+", label: "AIGC 产品原型落地" },
  { value: "2025", label: "全国数学建模一等奖" },
  { value: "AI", label: "标准化工作流搭建经验" },
  { value: "SZ", label: "目标城市深圳" }
];

const timeline = [
  {
    year: "2025.09 - 2025.10",
    title: "力方集团 · AIGC 设计助理",
    detail: "参与多个 AI 视觉项目，从概念探索、原型制作到交付协同，推动设计提效。"
  },
  {
    year: "2022.09 - 2026.06",
    title: "西南科技大学 · 设计学类（环境设计）",
    detail: "系统学习空间规划、方案表达与空间构成，同时自学 AIGC 与 AI 辅助设计工具。"
  }
];

const projects = [
  {
    title: "句读乐园 IP 设计",
    subtitle: "IP Design / PUNCT PLAY",
    description:
      "以标点符号为原型，将停顿、连接、表达和情绪转译成可识别的角色家族，并延展到展陈空间、文创包装、互动磁吸墙和视觉物料。",
    tags: ["IP 角色", "视觉系统", "场景落地"],
    image: "./public/assets/punct-play-main.jpg",
    gallery: [
      "./public/assets/punct-play-system.jpg",
      "./public/assets/punct-play-experience.jpg",
      "./public/assets/punct-play-guide.jpg"
    ]
  },
  {
    title: "AI 空间视觉实验",
    subtitle: "Spatial Visual / AI Architecture",
    description:
      "以生态湖区和公共建筑群为核心，通过生成式视觉探索建筑体量、山水界面、游线关系与夕照氛围，形成可用于方案汇报的空间概念图组。",
    tags: ["生态建筑", "空间叙事", "概念渲染"],
    image: "./public/assets/spatial-park-main-optimized.webp",
    gallery: [
      "./public/assets/spatial-park-lake-optimized.webp",
      "./public/assets/spatial-park-plaza-optimized.webp",
      "./public/assets/spatial-park-aerial-optimized.webp"
    ]
  },
  {
    title: "AIGC 文创设计",
    subtitle: "AIGC Cultural Product",
    description:
      "以“小小东方怪”为主题，将东方瑞兽、桌面陪伴和模块化玩法结合，探索从角色设定、产品造型到使用场景的 AIGC 文创方案。",
    tags: ["文创产品", "角色设定", "场景视觉"],
    image: "./public/assets/aigc-cultural-main.jpg",
    gallery: [
      "./public/assets/aigc-cultural-system.jpg",
      "./public/assets/aigc-cultural-modular.jpg"
    ]
  }
];

const strengths = [
  {
    title: "AIGC 视觉生成",
    label: "AI Visual Workflow",
    text: "熟悉 Midjourney、可灵、即梦、海螺等工具，能快速建立风格方向并推进到可展示的视觉结果。",
    mediaType: "video",
    media: "./public/assets/hero-background.mp4"
  },
  {
    title: "空间与构成能力",
    label: "Spatial Composition",
    text: "具备环境设计训练背景，对空间关系、画面结构和场景氛围有更强的整体控制力。",
    mediaType: "image",
    media: "./public/assets/strengths-space.jpg"
  },
  {
    title: "三维表达",
    label: "3D Proposal",
    text: "能够结合 Blender、SketchUp、3ds Max 等工具，把想法转化为更完整的三维提案。",
    mediaType: "image",
    media: "./public/assets/strengths-3d.jpg"
  },
  {
    title: "跨团队沟通",
    label: "Delivery / Alignment",
    text: "有与产品团队协作推进项目的经验，关注创意表达，也关注实际需求与落地节奏。"
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
    h(
      "div",
      { className: "shell hero-shell" },
      h(
        "header",
        { className: "topbar" },
        h(
          "a",
          { className: "brand", href: "#top" },
          h("span", { className: "brand-mark" }, "WQ"),
          h("strong", null, "王乔")
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
            { className: "contact-button", href: "mailto:1640288082@qq.com" },
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
          h("p", { className: "hero-role" }, "AI Visual Designer")
        ),

        h(
          "div",
          { className: "hero-lower" },
          h(
            "div",
            { className: "hero-impact" },
            h("strong", null, "02+"),
            h("p", null, "AIGC 产品原型与视觉方案已参与落地")
          ),
          h(
            "div",
            { className: "hero-main-copy" },
            h(
              "h1",
              { className: "hero-title", "aria-label": "AI Designer" },
              h("span", { className: "hero-title-mask" }, h("span", { className: "hero-title-line" }, "AI")),
              h("span", { className: "hero-title-mask" }, h("span", { className: "hero-title-line" }, "DESIGNER"))
            ),
            h(
              "p",
              { className: "hero-copy" },
              "我是王乔，专注 AIGC 视觉生成、原型表达与设计流程协同，希望把判断力和执行力一起带进真实项目。"
            ),
            h(
              "div",
              { className: "hero-actions" },
              h("a", { className: "primary-action", href: "#projects" }, "开始查看"),
              h("a", { className: "secondary-action", href: "mailto:1640288082@qq.com" }, "1640288082@qq.com")
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
        h("p", { className: "section-title-en" }, "JOURNEY"),
        sectionLabel("个人经历", "01"),
        h("h2", null, "AI 设计师身份的起点，是空间感、视觉感和工具感的叠加。"),
        h(
          "p",
          null,
          "从环境设计专业到 AIGC 项目实战，我更关注设计结果背后的方法论：如何让创意更快出现、让原型更清晰表达、让团队协作更高效。"
        )
      ),
      h(
        "div",
        { className: "journey-layout" },
        h(
          "div",
          { className: "portrait-card" },
          h("img", {
            src: "./public/assets/avatar.jpg",
            alt: "王乔人物形象",
            loading: "lazy",
            decoding: "async"
          }),
          h(
            "div",
            { className: "portrait-meta" },
            h("strong", null, "王乔"),
            h("p", null, "AI 设计师 / AIGC 视觉方向"),
            h(
              "div",
              { className: "contact-list" },
              h("a", { href: "tel:18776661941" }, "187 7666 1941"),
              h("a", { href: "mailto:1640288082@qq.com" }, "1640288082@qq.com"),
              h("span", null, "全国 / 可到岗")
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
            h("p", null, "工具栈"),
            h(
              "h3",
              null,
              "Photoshop / Illustrator / Blender / SketchUp / 3ds Max / CAD / Midjourney / 可灵 / 即梦"
            ),
            h(
              "p",
              { className: "bio-copy" },
              "我擅长在 AI 生成、二维视觉和三维空间之间切换，用更高效的方式组织想法，并把它们转化为更接近真实项目的设计结果。"
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

function projectsSection() {
  return h(
    "section",
    { className: "section motion-section", id: "projects" },
    h(
      "div",
      { className: "shell section-grid" },
      h(
        "div",
        { className: "section-intro" },
        h("p", { className: "section-title-en" }, "PROJECTS"),
        sectionLabel("精选项目", "02")
      ),
      h(
        "div",
        { className: "project-stack" },
        projects.map((project, index) =>
          h(
            "article",
            {
              className:
                "project-card" +
                (project.gallery ? " project-card-featured" : "") +
                (index === 2 ? " project-card-cultural" : ""),
              key: project.title
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
              )
            ),
            h(
              "div",
              { className: "project-visual" },
              project.gallery
                ? h(
                    Fragment,
                    null,
                    h("img", {
                      className: "project-main-image",
                      src: project.image,
                      alt: project.title + " 主视觉",
                      loading: "lazy",
                      decoding: "async"
                    }),
                    h(
                      "div",
                      { className: "project-gallery" },
                      project.gallery.map((image, galleryIndex) =>
                        h("img", {
                          key: image,
                          src: image,
                          alt: project.title + " 延展图 " + (galleryIndex + 1),
                          loading: "lazy",
                          decoding: "async"
                        })
                      )
                    )
                  )
                : h("img", {
                    src: project.image,
                    alt: project.title + " 项目展示图",
                    loading: "lazy",
                    decoding: "async"
                  })
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
        h("p", { className: "section-title-en" }, "STRENGTHS"),
        sectionLabel("个人优势", "03"),
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
                            poster: "./public/assets/hero-poster.svg",
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
      sectionLabel("联系我", "04"),
      h("p", { className: "contact-kicker" }, "Available for Shenzhen-based opportunities"),
      h(
        "h2",
        null,
        "如果你正在寻找一位能把 AI 工具、视觉判断与项目执行结合起来的设计师，",
        h("br"),
        "我们可以开始聊合作。"
      ),
      h(
        "div",
        { className: "contact-actions" },
        h("a", { href: "mailto:1640288082@qq.com" }, "1640288082@qq.com"),
        h("a", { href: "tel:18776661941" }, "187 7666 1941")
      ),
      h("p", { className: "contact-footnote" }, "王乔 · AI Designer")
    )
  );
}

function App() {
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
      projectsSection(),
      strengthsSection(),
      contactSection()
    )
  );
}

createRoot(document.getElementById("root")).render(h(App));



