import type { WebXREvidence } from "./webxr-capabilities";
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
