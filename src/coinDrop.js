import * as THREE from 'three'
import { createCoin } from './coin.js'
import { COIN_RADIUS, POP_TIME, POP_HEIGHT, SPIN_IDLE } from './coinIntro.js'

// ============================================================
//  コインを投入口へ入れる
//  HUD のコイン数をつかんでドラッグし、コイン箱の投入口（円盤とスロット）の上で離すと
//  コインが 1 枚減り、起動演出のコインと同じ大きさ・動き（ポンと飛び出す）で投入口の前に出て、
//  その場で起動演出の倍の速さでクルクル回ってから消える
//  投入口から外れたところで離すと、つかんだコインは HUD へ戻る
//
//  createCoinDrop({ boxEl, scene, camera, renderer, slot, getCount, onDrop, enabled })
//    boxEl:    HUD のコイン数（ここをつかむ。中のコインのアイコンをつかんだコインの絵に使う）
//    slot:     コイン箱の投入口のグループ（my-3d-parts の coinbox の userData.slot）
//              ローカル +z が面の法線、+y がスロットの向き、原点が投入口の中心
//    getCount: 今の所持数を返す。0 のときはつかめない
//    onDrop:   投入口に入れたときに呼ばれる（所持数を 1 減らす）
//    enabled:  入れられる状態か（室内・俯瞰・暗転中は false）
//    targets:  投入口のほかにコインを入れられるもの（板の紙など）[{ objects, enabled, accepts, drop }]
//              objects(): 当たりを見る Object3D の配列、enabled(): 入れられる状態か、accepts(hit): その当たり（Raycaster の結果）に入れられるか、
//              drop(hit): 入れたとき（所持数を減らすのもここ）。コインは当たった面の前に出る
//              hover(hit): あれば、つかんだコインが上に来たときにその当たりで、外れたら null で呼ぶ（紙に枠を付けるなど）
//              slot: あれば投入口（Object3D。ローカル +z が面の法線・原点が中心）。コインは当たった面ではなく投入口の前に出る（自販機など）
//  update(dt) を毎フレーム呼ぶ。dropOne() はドラッグせずに 1 枚入れる（コイン箱の前で Enter を押したとき）
//  dropInto(target) は targets のうち slot を持つものへ、ドラッグせずに 1 枚入れる（自販機の前で Enter を押したとき）
// ============================================================

const REACH       = 14     // カメラからこの距離までの投入口に入れられる (m)。カメラは sabちゃんの 8m 後ろ
const FRONT       = COIN_RADIUS + 0.15   // コインが現れる投入口の前の距離 (m)
const SPIN_TIME   = 0.35   // 飛び出したあと、その場で回ってから消えるまで (s)
export const INSERT_TIME = POP_TIME + SPIN_TIME   // 入れてからコインが消えるまで (s)
const SPIN_SPEED  = SPIN_IDLE * 2   // 回転速度（起動演出の待機中の倍）(rad/s)
const BACK_TIME   = 200    // 外したとき HUD へ戻るまで (ms)

export function createCoinDrop({ boxEl, scene, camera, renderer, slot, getCount, onDrop, enabled = () => true, targets = [] }) {
  const ray = new THREE.Raycaster()
  ray.far = REACH
  const ndc = new THREE.Vector2()
  const inserting = []   // 投入口の前で回っているコイン { mesh, home, ref, spin, age }

  let ghost = null       // つかんでいる間、指の下に出すコインのアイコン
  let pointerId = null

  // 入れられるもの。投入口は前の向き（slot の +z）の前に、ほかは当たった面の前にコインを出す
  const slotTarget = { objects: () => [slot], enabled, accepts: () => true, drop: () => onDrop(), slot }
  const all = [slotTarget, ...targets]
  const canGrab = () => getCount() > 0 && all.some(t => t.enabled())
  // 指の下にある、入れられるもの（いちばん手前）{ target, hit }。なければ null
  const overTarget = e => {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    let best = null
    for (const target of all) {
      if (!target.enabled()) continue
      const hit = ray.intersectObjects(target.objects(), true)[0]
      if (hit && target.accepts(hit) && (!best || hit.distance < best.hit.distance)) best = { target, hit }
    }
    return best
  }
  const moveGhost = e => {
    ghost.style.left = `${e.clientX}px`
    ghost.style.top  = `${e.clientY}px`
    const over = overTarget(e)
    ghost.classList.toggle('over', !!over)
    hover(over)
  }
  const hover = over => { for (const t of all) t.hover?.(t === over?.target ? over.hit : null) }

  // つかめるときだけ手のカーソルにする
  boxEl.addEventListener('pointerenter', () => boxEl.classList.toggle('grabbable', canGrab()))

  boxEl.addEventListener('pointerdown', e => {
    if (pointerId !== null || !canGrab()) return
    e.preventDefault()
    pointerId = e.pointerId
    boxEl.setPointerCapture(pointerId)
    boxEl.classList.add('grabbing')
    ghost = document.createElement('img')
    ghost.id = 'coin-ghost'
    ghost.src = `${import.meta.env.BASE_URL}ui/coin_icon_large.png`   // HUD の 40px のアイコンだと大きく出したときにぼやけるので、握ったときは大きい画像（180px）を使う
    ghost.alt = ''
    document.body.append(ghost)
    moveGhost(e)
  })
  boxEl.addEventListener('pointermove', e => {
    if (e.pointerId === pointerId) moveGhost(e)
  })
  const release = e => {
    if (e.pointerId !== pointerId) return
    pointerId = null
    boxEl.classList.remove('grabbing')
    const g = ghost
    ghost = null
    hover(null)
    const over = e.type === 'pointerup' && getCount() > 0 ? overTarget(e) : null
    if (over) {
      g.remove()
      over.target.drop(over.hit)
      if (over.target.slot) insertCoin(over.target.slot)
      else insertCoinAt(over.hit)
    } else {
      // 外したら HUD のコインの所へ戻して消す
      const r = boxEl.getBoundingClientRect()
      g.classList.remove('over')
      g.style.transition = `left ${BACK_TIME}ms ease-in, top ${BACK_TIME}ms ease-in, opacity ${BACK_TIME}ms ease-in`
      g.style.left = `${r.left + 12}px`
      g.style.top  = `${r.top + r.height / 2}px`
      g.style.opacity = '0'
      setTimeout(() => g.remove(), BACK_TIME)
    }
    boxEl.classList.toggle('grabbable', canGrab())
  }
  boxEl.addEventListener('pointerup', release)
  boxEl.addEventListener('pointercancel', release)

  // 投入口の前にコインを出す（表を投入口の外へ向ける）
  const _center = new THREE.Vector3(), _normal = new THREE.Vector3()
  function insertCoin(s) {
    s.updateWorldMatrix(true, false)
    _center.setFromMatrixPosition(s.matrixWorld)
    _normal.set(0, 0, 1).transformDirection(s.matrixWorld)
    spawnCoin()
  }
  // 当たった面（Raycaster の結果）の前にコインを出す
  function insertCoinAt(hit) {
    _center.copy(hit.point)
    _normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
    if (_normal.dot(ray.ray.direction) > 0) _normal.negate()   // カメラの側へ
    spawnCoin()
  }
  function spawnCoin() {
    const mesh = createCoin({ renderer, radius: COIN_RADIUS })
    mesh.scale.setScalar(0)
    scene.add(mesh)
    inserting.push({
      mesh, age: 0, spin: 0,
      home: _center.clone().addScaledVector(_normal, FRONT),      // 投入口の前の、回っている位置
      ref: _normal.clone(),                                        // 向きの基準（接平面に投影して使う）
    })
  }

  const _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3()
  const _mat = new THREE.Matrix4(), _spinQ = new THREE.Quaternion(), _yAxis = new THREE.Vector3(0, 1, 0)
  function update(dt) {
    for (let i = inserting.length - 1; i >= 0; i--) {
      const c = inserting[i], { mesh } = c
      c.age += dt
      if (c.age >= POP_TIME + SPIN_TIME) {
        // 回り終えたらその場で消える
        scene.remove(mesh)
        mesh.traverse(o => { o.geometry?.dispose(); o.material?.dispose() })
        inserting.splice(i, 1)
        continue
      }
      let scale = 1
      if (c.age < POP_TIME) {
        // 起動演出と同じく、ポンと飛び出しながら大きくなる
        const t = c.age / POP_TIME
        scale = 1 - Math.pow(1 - t, 3)
        _up.copy(c.home).normalize()
        mesh.position.copy(c.home).addScaledVector(_up, Math.sin(Math.PI * t) * POP_HEIGHT)
      } else {
        mesh.position.copy(c.home)
      }
      // 惑星の法線を上にして立て、その軸でクルクル回す（coinIntro.js と同じ）
      c.spin += SPIN_SPEED * dt
      _up.copy(mesh.position).normalize()
      _fwd.copy(c.ref).addScaledVector(_up, -c.ref.dot(_up)).normalize()
      _right.crossVectors(_up, _fwd)
      _mat.makeBasis(_right, _up, _fwd)
      mesh.quaternion.setFromRotationMatrix(_mat).multiply(_spinQ.setFromAxisAngle(_yAxis, c.spin))
      mesh.scale.setScalar(Math.max(scale, 0.001))
    }
  }

  // ドラッグせずに 1 枚入れる。入れられたら true
  function dropInto(target) {
    if (!(getCount() > 0 && target.enabled())) return false
    target.drop()
    insertCoin(target.slot)
    boxEl.classList.toggle('grabbable', canGrab())
    return true
  }
  const dropOne = () => dropInto(slotTarget)

  return { update, dropOne, dropInto }
}
