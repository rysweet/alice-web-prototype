import type { WebXREvidence } from "./webxr-capabilities";
import type { CameraVrComfortEvidence } from "./runtime-parity-evidence";
import type { WebXRLocomotionMode } from "./webxr-locomotion";
import type { WebXRSessionState } from "./webxr-session";

export type WebXRButtonState = "disabled" | "enter" | "exit";

export interface WebXRStatusViewModel {
  readonly status: WebXRSessionState;
  readonly buttonState: WebXRButtonState;
  readonly message?: string;
  readonly locomotionMode?: WebXRLocomotionMode;
  readonly invalidTargetMessage?: string;
  readonly evidence: readonly WebXREvidence[];
  readonly cameraComfort?: CameraVrComfortEvidence;
}

export interface WebXRStatusElements {
  readonly button: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly evidence: HTMLElement;
}

function appendTextElement(parent: HTMLElement, tagName: string, text: string): HTMLElement {
  const element = parent.ownerDocument.createElement(tagName);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function buttonLabel(buttonState: WebXRButtonState): string {
  switch (buttonState) {
    case "disabled":
      return "VR unavailable";
    case "exit":
      return "Exit VR";
    case "enter":
      return "Enter VR";
  }
}

export function renderWebXRStatus(root: HTMLElement, viewModel: WebXRStatusViewModel): WebXRStatusElements {
  root.replaceChildren();

  const button = root.ownerDocument.createElement("button");
  button.type = "button";
  button.dataset.aliceWebxrVrButton = viewModel.buttonState;
  button.disabled = viewModel.buttonState === "disabled";
  button.textContent = buttonLabel(viewModel.buttonState);
  root.appendChild(button);

  const status = appendTextElement(root, "div", viewModel.message ?? `VR status: ${viewModel.status}`);
  status.dataset.aliceWebxrStatus = viewModel.status;

  if (viewModel.locomotionMode) {
    const locomotion = appendTextElement(root, "div", `Locomotion: ${viewModel.locomotionMode}`);
    locomotion.dataset.aliceWebxrLocomotionMode = viewModel.locomotionMode;
  }

  if (viewModel.invalidTargetMessage) {
    const invalidTarget = appendTextElement(root, "div", viewModel.invalidTargetMessage);
    invalidTarget.dataset.aliceWebxrInvalidTarget = "true";
  }

  if (viewModel.cameraComfort) {
    const comfort = root.ownerDocument.createElement("section");
    comfort.id = "camera-vr-comfort-panel";
    comfort.dataset.testid = "alice-camera-vr-comfort-panel";
    comfort.setAttribute("aria-label", "Alice camera and VR comfort evidence");

    const comfortStatus = appendTextElement(
      comfort,
      "div",
      `Camera/WebXR comfort: ${viewModel.cameraComfort.status}`,
    );
    comfortStatus.id = "camera-vr-comfort-status";
    comfortStatus.dataset.testid = "alice-camera-vr-comfort-status";

    const keyboard = appendTextElement(
      comfort,
      "div",
      viewModel.cameraComfort.keyboardMovementAvailable === true
        ? "Keyboard camera movement available"
        : viewModel.cameraComfort.keyboardMovementAvailable === false
          ? "Keyboard camera movement unavailable"
          : "Keyboard camera movement was not measured",
    );
    keyboard.dataset.testid = "alice-camera-keyboard-movement";

    const reducedMotion = appendTextElement(
      comfort,
      "div",
      viewModel.cameraComfort.reducedMotionRespected === true
        ? "Reduced-motion comfort check respected"
        : viewModel.cameraComfort.reducedMotionRespected === false
          ? "Reduced-motion comfort check unavailable"
          : "Reduced-motion preference was not measured",
    );
    reducedMotion.dataset.testid = "alice-camera-reduced-motion";

    const trueVr = appendTextElement(
      comfort,
      "div",
      viewModel.cameraComfort.unsupportedReason,
    );
    trueVr.id = "true-vr-unsupported";
    trueVr.dataset.testid = "alice-true-vr-unsupported";

    const session = viewModel.cameraComfort.browserWebXrSession;
    if (session) {
      const observationText = session.locomotionObserved
        ? `; locomotion observed: ${session.locomotionResult}`
        : "; locomotion observed: not-observed";
      const sessionText = `Browser WebXR session: ${session.sessionState}; reference space: ${session.referenceSpaceType}; input sources: ${session.inputSourceCount}; locomotion: ${session.locomotionMode}${observationText}`;
      const sessionEvidence = appendTextElement(comfort, "div", sessionText);
      sessionEvidence.dataset.testid = "alice-browser-webxr-session-evidence";
    }

    const playtest = viewModel.cameraComfort.playerComfortPlaytest;
    if (playtest) {
      const playtestBoundary = appendTextElement(comfort, "div", playtest.unsupportedReason);
      playtestBoundary.dataset.testid = "alice-player-comfort-playtest-boundary";
    }

    root.appendChild(comfort);
  }

  const evidence = root.ownerDocument.createElement("ul");
  evidence.dataset.aliceWebxrEvidence = "true";
  for (const item of viewModel.evidence) {
    const entry = root.ownerDocument.createElement("li");
    entry.dataset.aliceWebxrEvidenceCode = item.code;
    entry.dataset.aliceWebxrEvidenceSeverity = item.severity;
    entry.textContent = item.message;
    evidence.appendChild(entry);
  }
  root.appendChild(evidence);

  return { button, status, evidence };
}
