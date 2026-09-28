import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

// Same pinned animated hand assets used by Oasis.
const HAND_ASSETS = Object.freeze({
  left: 'https://raw.githubusercontent.com/permabulk69420-pixel/dumbgame/be12b76764264438e33879b3a05406f16d37c194/assets/models/hands/LeftHand.glb',
  right: 'https://raw.githubusercontent.com/permabulk69420-pixel/dumbgame/be12b76764264438e33879b3a05406f16d37c194/assets/models/hands/RightHand.glb'
});

// Same grip-space orientation used by Oasis.
const HAND_GRIP_OFFSETS = Object.freeze({
  left: Object.freeze({ position: Object.freeze([0, 0, 0]), rotation: Object.freeze([0, 0, Math.PI / 2]) }),
  right: Object.freeze({ position: Object.freeze([0, 0, 0]), rotation: Object.freeze([0, 0, -Math.PI / 2]) })
});

const loader = new GLTFLoader();
const gripMatrix = new THREE.Matrix4();
const targetLocalMatrix = new THREE.Matrix4();
const targetWorldMatrix = new THREE.Matrix4();
const socketWorldInverse = new THREE.Matrix4();
const rootWorldMatrix = new THREE.Matrix4();
const desiredRootWorldMatrix = new THREE.Matrix4();
const parentWorldInverse = new THREE.Matrix4();
const desiredRootLocalMatrix = new THREE.Matrix4();
const unitScale = new THREE.Vector3(1, 1, 1);

function prepareModel(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = false;
  });
  return root;
}

function createActions(root, clips) {
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map();

  for (const clip of clips) {
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true;
    action.weight = 0;
    actions.set(clip.name, action);
  }

  return { mixer, actions, current: null };
}

function setPose(state, name, amount) {
  const action = state.actions.get(name);
  if (!action) return;

  if (state.current && state.current !== action) state.current.weight = 0;
  state.current = action;
  action.weight = 1;
  action.time = THREE.MathUtils.clamp(amount, 0, 1);
}

export function createVRHands({ renderer, parent, onError = console.warn }) {
  if (!parent) throw new Error('VR hands require a player rig parent.');

  const controllers = [renderer.xr.getController(0), renderer.xr.getController(1)];
  const grips = [renderer.xr.getControllerGrip(0), renderer.xr.getControllerGrip(1)];
  const models = { left: null, right: null };

  const states = controllers.map((controller, index) => {
    parent.add(controller);
    parent.add(grips[index]);
    const objectGrip = new THREE.Group();
    objectGrip.name = `controller-${index}-held-object-anchor`;
    grips[index].add(objectGrip);

    return {
      controller,
      grip: grips[index],
      objectGrip,
      inputSource: null,
      handedness: '',
      handAnchor: null,
      handRoot: null,
      gripSocket: null,
      indexTip: null,
      mixerState: null,
      visualGripTarget: null,
      visualRestorePosition: new THREE.Vector3(),
      visualRestoreQuaternion: new THREE.Quaternion(),
      visualRestoreScale: new THREE.Vector3(1, 1, 1),
      visualGripApplied: false,
      pointing: false,
      primaryDown: false
    };
  });

  function resetObjectGrip(state) {
    if (state.objectGrip.parent !== state.grip) state.grip.add(state.objectGrip);
    state.objectGrip.position.set(0, 0, 0);
    state.objectGrip.quaternion.identity();
    state.objectGrip.scale.set(1, 1, 1);
    state.objectGrip.updateMatrixWorld(true);
  }

  function restoreVisualGrip(state) {
    if (!state.visualGripApplied || !state.handRoot) return;
    state.handRoot.position.copy(state.visualRestorePosition);
    state.handRoot.quaternion.copy(state.visualRestoreQuaternion);
    state.handRoot.scale.copy(state.visualRestoreScale);
    state.handRoot.updateMatrixWorld(true);
    state.visualGripApplied = false;
  }

  function syncObjectGrip(state) {
    if (!state.gripSocket) return;
    restoreVisualGrip(state);
    if (state.objectGrip.parent !== state.grip) state.grip.add(state.objectGrip);
    state.grip.updateWorldMatrix(true, false);
    state.gripSocket.updateWorldMatrix(true, false);
    gripMatrix.copy(state.grip.matrixWorld).invert().multiply(state.gripSocket.matrixWorld)
      .decompose(state.objectGrip.position, state.objectGrip.quaternion, state.objectGrip.scale);
    state.objectGrip.updateMatrixWorld(true);
  }

  function applyVisualGrip(state) {
    const target = state.visualGripTarget;
    if (!target?.object || !state.handRoot || !state.gripSocket) return;

    restoreVisualGrip(state);
    state.handRoot.updateWorldMatrix(true, false);
    state.gripSocket.updateWorldMatrix(true, false);
    target.object.updateWorldMatrix(true, false);

    state.visualRestorePosition.copy(state.handRoot.position);
    state.visualRestoreQuaternion.copy(state.handRoot.quaternion);
    state.visualRestoreScale.copy(state.handRoot.scale);

    targetLocalMatrix.compose(target.position, target.quaternion, unitScale);
    targetWorldMatrix.multiplyMatrices(target.object.matrixWorld, targetLocalMatrix);
    socketWorldInverse.copy(state.gripSocket.matrixWorld).invert();
    rootWorldMatrix.copy(state.handRoot.matrixWorld);
    desiredRootWorldMatrix.multiplyMatrices(targetWorldMatrix, socketWorldInverse).multiply(rootWorldMatrix);

    const rootParent = state.handRoot.parent;
    if (!rootParent) return;
    rootParent.updateWorldMatrix(true, false);
    parentWorldInverse.copy(rootParent.matrixWorld).invert();
    desiredRootLocalMatrix.multiplyMatrices(parentWorldInverse, desiredRootWorldMatrix)
      .decompose(state.handRoot.position, state.handRoot.quaternion, state.handRoot.scale);
    state.handRoot.updateMatrixWorld(true);
    state.visualGripApplied = true;
  }

  function detach(state) {
    restoreVisualGrip(state);
    state.visualGripTarget = null;
    resetObjectGrip(state);
    if (state.handAnchor) state.grip.remove(state.handAnchor);
    state.handAnchor = null;
    state.handRoot = null;
    state.gripSocket = null;
    state.indexTip = null;
    state.mixerState = null;
  }

  function attach(state) {
    const handedness = state.handedness;
    const gltf = models[handedness];
    if (!gltf || (handedness !== 'left' && handedness !== 'right')) return;

    detach(state);

    const root = prepareModel(clone(gltf.scene));
    root.name = `${handedness}-vr-hand`;

    const offset = HAND_GRIP_OFFSETS[handedness];
    const anchor = new THREE.Group();
    anchor.name = `${handedness}-hand-grip-offset`;
    anchor.position.fromArray(offset.position);
    anchor.rotation.set(...offset.rotation);
    anchor.add(root);
    state.grip.add(anchor);

    const side = handedness === 'left' ? 'l' : 'r';
    state.gripSocket = root.getObjectByName(`b_${side}_grip`) || null;
    state.indexTip = root.getObjectByName(`b_${side}_index_ignore`) || null;
    state.handAnchor = anchor;
    state.handRoot = root;
    state.mixerState = createActions(root, gltf.animations);
    setPose(state.mixerState, 'Open', 0);
    syncObjectGrip(state);
  }

  for (const state of states) {
    state.controller.addEventListener('connected', (event) => {
      state.inputSource = event.data;
      state.handedness = event.data.handedness || '';
      state.pointing = false;
      state.primaryDown = false;
      attach(state);
    });

    state.controller.addEventListener('disconnected', () => {
      state.inputSource = null;
      state.handedness = '';
      state.pointing = false;
      state.primaryDown = false;
      detach(state);
    });
  }

  Promise.allSettled([
    loader.loadAsync(HAND_ASSETS.left),
    loader.loadAsync(HAND_ASSETS.right)
  ]).then(([left, right]) => {
    if (left.status === 'fulfilled') models.left = left.value;
    else onError(`Left VR hand failed to load: ${left.reason?.message || left.reason}`);

    if (right.status === 'fulfilled') models.right = right.value;
    else onError(`Right VR hand failed to load: ${right.reason?.message || right.reason}`);

    for (const state of states) attach(state);
  });

  function update(dt) {
    for (const state of states) {
      const buttons = state.inputSource?.gamepad?.buttons || [];
      const trigger = buttons[0]?.value ?? 0;
      const squeeze = buttons[1]?.value ?? 0;
      const primary = Boolean(buttons[4]?.pressed);

      if (state.handedness === 'left' && primary && !state.primaryDown) {
        state.pointing = !state.pointing;
      }
      state.primaryDown = primary;

      if (!state.mixerState) continue;

      if (state.weaponHeld || state.swordSupportEntry) {
        setPose(state.mixerState, 'Grip', 1);
      } else if (state.magicPose) {
        setPose(state.mixerState, 'Open', 0);
      } else if (squeeze > 0.08 && trigger > 0.08) {
        setPose(state.mixerState, 'Fist', Math.max(trigger, squeeze));
      } else if (squeeze > 0.08) {
        setPose(state.mixerState, 'Grip', squeeze);
      } else if (state.pointing && trigger <= 0.08) {
        setPose(state.mixerState, 'Point', 1);
      } else if (trigger > 0.08) {
        setPose(state.mixerState, 'Pinch', trigger);
      } else {
        setPose(state.mixerState, 'Open', 0);
      }

      state.mixerState.mixer.update(dt);
      syncObjectGrip(state);
      applyVisualGrip(state);
    }
  }

  function refreshObjectGrips() {
    for (const state of states) syncObjectGrip(state);
  }

  function setVisualGripTarget(state, object, position, quaternion) {
    if (!state) return;
    state.visualGripTarget = {
      object,
      position: position.clone(),
      quaternion: quaternion.clone()
    };
  }

  function clearVisualGripTarget(state) {
    if (!state) return;
    restoreVisualGrip(state);
    state.visualGripTarget = null;
  }

  function getState(handedness) {
    return states.find((state) => state.handedness === handedness) || null;
  }

  function getObjectGrip(handedness) {
    return getState(handedness)?.objectGrip || null;
  }

  return {
    update,
    states,
    controllers,
    grips,
    objectGrips: states.map((state) => state.objectGrip),
    refreshObjectGrips,
    setVisualGripTarget,
    clearVisualGripTarget,
    getState,
    getObjectGrip
  };
}
