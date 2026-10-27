import * as THREE from 'three'

// ============================================================
//  地平線の向こう（星の裏）に隠れたものをカメラの描画から外す
//  three.js は画面の外のものは描かないが、画面の中で星の陰に隠れたものは描いてしまう
//  （俯瞰では画面の三角形の 6 割ほどが星の裏）。毎フレーム、ものの外接球がまるごと星の陰に入っていたら描かない
//  隠すときはレイヤー 0 から外してレイヤー HIDDEN_LAYER だけにする。カメラはレイヤー 0 しか描かないので見えなくなる
//  影を描く光のカメラには HIDDEN_LAYER も入れておく（地平線のすぐ向こうのものの影が手前に落ちることがあるので、影はそのまま）
//  レイキャスターもレイヤー 0 しか見ないので、地面を測る地形メッシュ（exclude）は隠さない
// ============================================================

export const HIDDEN_LAYER = 31

const _sphere = new THREE.Sphere()
const _cam    = new THREE.Vector3()
const _toO    = new THREE.Vector3()
const _v      = new THREE.Vector3()

// scene: 見るシーン / radius: 星のいちばん低い表面より少し小さい半径 (m)。この球を隠すものとみなす
// exclude: 隠さないもの（Set）
export function createHorizonCull({ scene, radius, exclude = new Set() }) {
  const hidden = new Set()

  function hide(o, on) {
    if (on === hidden.has(o)) return
    if (on) { o.layers.disable(0); o.layers.enable(HIDDEN_LAYER); hidden.add(o) }
    else    { o.layers.enable(0); o.layers.disable(HIDDEN_LAYER); hidden.delete(o) }
  }

  function update(camera) {
    camera.getWorldPosition(_cam)
    const d = _cam.length()
    // カメラが星の中にいたら何も隠さない
    if (d <= radius) { for (const o of [...hidden]) hide(o, false); return }
    const coneAng = Math.asin(radius / d)              // 星が見える円錐の半分の角度
    const tangent = Math.sqrt(d * d - radius * radius) // カメラから星の縁（地平線）までの距離
    _toO.copy(_cam).negate().divideScalar(d)

    scene.traverse(o => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || o.frustumCulled === false || exclude.has(o)) return
      const bs = o.isInstancedMesh ? (o.boundingSphere ?? (o.computeBoundingSphere(), o.boundingSphere))
        : (o.geometry.boundingSphere ?? (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere))
      _sphere.copy(bs).applyMatrix4(o.matrixWorld)
      _v.subVectors(_sphere.center, _cam)
      const dist = _v.length()
      // 球がまるごと「星が見える円錐の中」で「地平線より遠い」なら、星の表面より奥にあって見えない
      const behind = _sphere.radius < dist
        && dist - _sphere.radius > tangent
        && _v.angleTo(_toO) + Math.asin(_sphere.radius / dist) < coneAng
      hide(o, behind)
    })
    // シーンから外れたものは元のレイヤーに戻して忘れる
    for (const o of hidden) if (!o.parent) hide(o, false)
  }

  return { update }
}
