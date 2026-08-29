export type InputAction = string;

export interface InputService {
    justPressed(action: InputAction): boolean;
}