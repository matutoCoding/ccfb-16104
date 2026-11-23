// WebGL2 片元着色器：均匀网格 DDA + 元球光线步进，隐式曲面直接求交
// 数据纹理（RGBA16F / RGBA32I，宽 256）：
// uBalls 每行一球：中心xyz、半径；uBallMeta 每行：面团idx、融合k
// uDough 每个面团两行：pos.xyz/rot；r0/rH/rV/open
// uCuts 每条三行：center.xyz/angle；half.xyz/depth；面团idx/...
// uGrid 每格一行 RGBA32I：最多 4 个面团索引，-1 补位

export const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`

export const FRAG = `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uRes;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform float uFov;

uniform sampler2D uBalls;
uniform sampler2D uBallMeta;
uniform int uBallCount;
uniform sampler2D uDough;
uniform int uDoughCount;
uniform sampler2D uCuts;
uniform int uCutCount;
uniform sampler2D uMarkers;
uniform int uMarkerCount;
uniform highp isampler2D uGrid;
uniform vec3 uGridMin;
uniform vec3 uGridDim;
uniform float uCellSize;

uniform vec4 uTray;   // xy 半宽半深，z 挡边高，w 未用
uniform float uBakeU;
uniform float uOvenTemp;
uniform vec2 uHeat;
uniform float uHydration;
uniform float uMaxSteps;
uniform vec3 uLightDir;

out vec4 outColor;
const float MAX_DIST = 2600.0;
const float TEXW = 256.0;

vec3 camRay(vec2 uv){
  vec2 d = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * tan(uFov * 0.5);
  return normalize(uCamRot * vec3(d.x, d.y, -1.0));
}

vec4 fetch4(sampler2D tex, float idx){
  vec2 uv = (vec2(mod(idx, TEXW), floor(idx / TEXW)) + 0.5)
          / vec2(TEXW, float(textureSize(tex, 0).y));
  return texture(tex, uv);
}
vec3 fetch3(sampler2D tex, float idx){ return fetch4(tex, idx).xyz; }

float pSmin(float a, float b, float k){
  float h = clamp(k - abs(a - b), 0.0, k) / k;
  return min(a, b) - h * h * k * 0.25;
}

float roundBox(vec3 p, vec3 b, float rad){
  vec3 q = abs(p) - b + rad;
  return length(max(q, 0.0)) - rad + min(max(q.x, max(q.y, q.z)), 0.0);
}

// 单面团隐式场（返回世界毫米距离，y=割口标记）
vec2 doughField(int di, vec3 p){
  vec4 m = fetch4(uDough, float(di) * 2.0);
  vec4 s = fetch4(uDough, float(di) * 2.0 + 1.0);
  vec3 q = p - m.xyz;
  float c = cos(m.w), sn = sin(m.w);
  q = vec3(c * q.x - sn * q.z, q.y, sn * q.x + c * q.z);
  vec3 lp = vec3(q.x / (s.x * s.y), q.y / (s.x * s.z), q.z / (s.x * s.y));

  float f = 1e9;
  for(int i = 0; i < 1024; i++){
    if(i >= uBallCount) break;
    vec4 meta = fetch4(uBallMeta, float(i));
    if(int(meta.x + 0.5) != di) continue;
    vec4 b = fetch4(uBalls, float(i));
    f = pSmin(f, length(lp - b.xyz) - b.w, meta.y);
  }
  f = max(f, -lp.y); // 底面贴盘

  float cut = 0.0;
  for(int i = 0; i < 64; i++){
    if(i >= uCutCount) break;
    vec4 owner = fetch4(uCuts, float(i) * 3.0 + 2.0);
    if(int(owner.x + 0.5) != di) continue;
    vec4 c0 = fetch4(uCuts, float(i) * 3.0);
    vec4 c1 = fetch4(uCuts, float(i) * 3.0 + 1.0);
    vec3 qp = lp - c0.xyz;
    float ca = cos(-c0.w), sa = sin(-c0.w);
    qp = vec3(ca * qp.x - sa * qp.z, qp.y, sa * qp.x + ca * qp.z);
    vec3 hf = vec3(c1.x * s.w, c1.y * (1.1 - 0.3 * s.w), c1.z);
    float g = roundBox(qp, hf, hf.x * 0.6);
    if(g < 0.0) cut = 1.0;
    f = max(f, -g);
  }
  // 本地距离 → 世界毫米，乘最小缩放保持 1-Lipschitz
  float sMin = s.x * min(s.y, s.z);
  return vec2(f * sMin, cut);
}

// 网格内点：只对当前 cell 登记的面团求值
vec2 sceneAt(vec3 p){
  vec3 gp = (p - uGridMin) / uCellSize;
  if(any(lessThan(gp, vec3(0.0))) || any(greaterThanEqual(gp, uGridDim))) return vec2(1e9, 0.0);
  ivec3 cell = ivec3(floor(gp));
  float row = float(cell.x + int(uGridDim.x) * (cell.y + int(uGridDim.y) * cell.z));
  ivec4 owners = texture(uGrid, (vec2(mod(row, TEXW), floor(row / TEXW)) + 0.5)
                       / vec2(TEXW, max(float(textureSize(uGrid, 0).y), 1.0)));
  float f = 1e9;
  float cut = 0.0;
  for(int i = 0; i < 4; i++){
    int di = owners[i];
    if(di < 0) break;
    vec2 r = doughField(di, p);
    f = pSmin(f, r.x, 2.2);
    cut = max(cut, r.y);
  }
  return vec2(f, cut);
}

float markerField(vec3 p){
  float f = 1e9;
  for(int i = 0; i < 64; i++){
    if(i >= uMarkerCount) break;
    f = min(f, length(p - fetch3(uMarkers, float(i))) - 5.0);
  }
  return f;
}

float trayField(vec3 p){
  float side = min(uTray.x - abs(p.x), uTray.y - abs(p.z));
  return min(max(side, p.y - uTray.z), p.y);
}

vec3 calcNormal(vec3 p){
  float e = 0.45;
  float dx = sceneAt(p + vec3(e,0,0)).x - sceneAt(p - vec3(e,0,0)).x;
  float dy = sceneAt(p + vec3(0,e,0)).x - sceneAt(p - vec3(0,e,0)).x;
  float dz = sceneAt(p + vec3(0,0,e)).x - sceneAt(p - vec3(0,0,e)).x;
  return normalize(vec3(dx, dy, dz));
}

vec3 crustColor(float b){
  vec3 pale = vec3(0.93, 0.86, 0.70);
  vec3 gold = vec3(0.83, 0.58, 0.24);
  vec3 dark = vec3(0.36, 0.18, 0.08);
  vec3 c = mix(pale, gold, smoothstep(0.0, 0.7, b));
  return mix(c, dark, smoothstep(0.6, 1.0, b));
}

float browning(float region){
  float tempF = clamp((uOvenTemp - 140.0) / 80.0, 0.3, 1.5);
  float heatF = mix(uHeat.x, uHeat.y, clamp(region, 0.0, 1.0));
  float hydF = 1.0 - clamp((uHydration - 0.55) * 0.55, 0.0, 0.25);
  float dose = pow(clamp(uBakeU, 0.0, 1.0), 2.2) * tempF * heatF * hydF;
  return clamp((dose - 0.18) / 0.62, 0.0, 1.0);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 ro = uCamPos;
  vec3 rd = camRay(uv);
  float t = 2.0;
  float hitCut = 0.0;
  int kind = 0; // 1 面团 2 盘 3 标记

  // DDA 状态
  vec3 startCell = (ro - uGridMin) / uCellSize;
  ivec3 cell = ivec3(floor(startCell));
  vec3 stepV = sign(rd);
  ivec3 stepI = ivec3(stepV);
  vec3 tDelta = uCellSize / max(abs(rd), vec3(1e-6));
  vec3 cellBoundary = (vec3(cell) + max(stepV, vec3(0.0))) * uCellSize + uGridMin;
  vec3 tNext = (cellBoundary - ro) / rd;
  tNext = mix(tNext, vec3(1e12), lessThan(abs(rd), vec3(1e-6)));
  float tCell = 0.0;

  for(int i = 0; i < 192; i++){
    if(float(i) >= uMaxSteps || t > MAX_DIST) break;
    vec3 p = ro + rd * t;
    vec2 r = sceneAt(p);
    float mk = markerField(p);
    float tr = trayField(p);
    float d = min(r.x, min(mk, tr));
    // 下一步若跨越 cell 边界，步长截到边界，保证不会漏求交
    float tBoundary = min(tNext.x, min(tNext.y, tNext.z));
    float move = max(d * 0.85, 0.4);
    if(t + move > tBoundary) move = max(tBoundary - t, 0.4);
    if(d < 0.7){
      if(mk <= r.x && mk <= tr){ kind = 3; }
      else if(tr < r.x){ kind = 2; }
      else { kind = 1; hitCut = r.y; }
      break;
    }
    t += move;
    // 更新 DDA cell
    while(t >= tBoundary - 0.01){
      if(tNext.x < tNext.y && tNext.x < tNext.z){
        tNext.x += tDelta.x; cell.x += stepI.x;
      } else if(tNext.y < tNext.z){
        tNext.y += tDelta.y; cell.y += stepI.y;
      } else {
        tNext.z += tDelta.z; cell.z += stepI.z;
      }
      tBoundary = min(tNext.x, min(tNext.y, tNext.z));
      if(any(lessThan(cell, ivec3(0))) || any(greaterThanEqual(cell, ivec3(uGridDim)))){
        tNext = vec3(1e18);
        break;
      }
    }
    tCell = tBoundary;
  }
  if(kind == 0){
    outColor = vec4(mix(vec3(0.15, 0.17, 0.21), vec3(0.30, 0.33, 0.38), uv.y), 1.0);
    return;
  }
  vec3 p = ro + rd * t;
  if(kind == 3){ outColor = vec4(0.85, 0.12, 0.10, 1.0); return; }
  if(kind == 2){
    float shade = 0.55 + 0.35 * max(uLightDir.y, 0.0);
    outColor = vec4(vec3(0.60, 0.63, 0.67) * shade, 1.0);
    return;
  }
  vec3 n = calcNormal(p);
  float region = n.y > 0.35 ? 0.0 : (n.y < -0.2 ? 1.0 : 0.5);
  float b = browning(region);
  vec3 base = crustColor(b);
  if(hitCut > 0.5) base = mix(base, vec3(0.45, 0.24, 0.11), 0.75);
  float diff = 0.35 + 0.65 * max(dot(n, uLightDir), 0.0);
  float spec = pow(max(dot(reflect(-uLightDir, n), -rd), 0.0), 28.0) * 0.25;
  float rimL = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * 0.12;
  outColor = vec4(pow(base * diff + vec3(spec + rimL), vec3(0.92)), 1.0);
}
`
