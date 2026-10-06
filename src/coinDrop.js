import * as THREE from 'three'
import { createCoin } from './coin.js'

// ============================================================
//  コインを投入口へ入れる
//  HUD のコイン数をつかんでドラッグし、コイン箱の投入口（円盤とスロット）の上で離すと
//  コインが 1 枚減り、投入口の前に出たコインが縦のスロットへ吸い込まれて消える
//  投入口から外れたところで離すと、つかんだコインは HUD へ戻る
//
//  createCoinDrop({ boxEl, camera, renderer, slot, getCount, onDrop, enabled })
//    boxEl:    HUD のコイン数（ここをつかむ。中のコインのアイコンをつかんだコインの絵に使う）
//    slot:     コイン箱の投入口のグループ（my-3d-parts の coinbox の userData.slot）
//              ローカル +z が面の法線、+y がスロットの向き、原点が投入口の中心
//    getCount: 今の所持数を返す。0 のときはつかめない
//    onDrop:   投入口に入れたときに呼ばれる（所持数を 1 減らす）
//    enabled:  入れられる状態か（室内・俯瞰・暗転中は false）
//  update(dt) を毎フレーム呼ぶ
// ============================================================

const REACH       = 14     // カメラからこの距離までの投入口に入れられる (m)。カメラは sabちゃんの 8m 後ろ
const COIN_R      = 0.085  // 入れるコインの半径（投入口のローカル単位。コイン箱を 2.35 倍で置くと約 0.2m）
const START_Z     = 0.3    // コインが現れる投入口の前の距離（ローカル単位）
const END_Z       = -0.15  // ここまで沈むと消える（箱の中）
const INSERT_TIME = 0.55   // 現れてから消えるまで (s)
const BACK_TIME   = 200    // 外したとき HUD へ戻るまで (ms)

export function createCoinDrop({ boxEl, camera, renderer, slot, getCount, onDrop, enabled = () => true }) {
  const ray = new THREE.Raycaster()
  ray.far = REACH
  const ndc = new THREE.Vector2()
  const inserting = []   // スロットへ入っていく途中のコイン { mesh, t }

  let ghost = null       // つかんでいる間、指の下に出すコインのアイコン
  let pointerId = null

  const canGrab = () => getCount() > 0 && enabled()
  const overSlot = e => {
    if (!enabled()) return false
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    return ray.intersectObject(slot, true).length > 0
  }
  const moveGhost = e => {
    ghost.style.left = `${e.clientX}px`
    ghost.style.top  = `${e.clientY}px`
    ghost.classList.toggle('over', overSlot(e))
  }

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
    ghost.src = boxEl.querySelector('img').src
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
    if (e.type === 'pointerup' && getCount() > 0 && overSlot(e)) {
      g.remove()
      onDrop()
      insertCoin()
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

  // 投入口の前にコインを出し、縦のスロットへ縁から差し込む（コインの面をスロットの向き・面の法線と同じ面に立てる）
  function insertCoin() {
    const mesh = createCoin({ renderer, radius: COIN_R })
    mesh.rotation.y = Math.PI / 2   // コインの表（+Z）を投入口の +x へ向ける
    mesh.position.z = START_Z
    slot.add(mesh)
    inserting.push({ mesh, t: 0 })
  }

  function update(dt) {
    for (let i = inserting.length - 1; i >= 0; i--) {
      const c = inserting[i]
      c.t += dt / INSERT_TIME
      const k = Math.min(1, c.t)
      c.mesh.position.z = THREE.MathUtils.lerp(START_Z, END_Z, k * k)   // だんだん速く吸い込まれる
      if (k >= 1) {
        slot.remove(c.mesh)
        c.mesh.traverse(o => { o.geometry?.dispose(); o.material?.dispose() })
        inserting.splice(i, 1)
      }
    }
  }

  return { update }
}
