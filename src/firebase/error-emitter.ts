'use client';

type Listener = (eventData?: any) => void;

class EventEmitter {
  private listeners: { [eventName: string]: Listener[] } = {};

  on(eventName: string, listener: Listener) {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName].push(listener);
  }

  emit(eventName: string, eventData?: any) {
    if (this.listeners[eventName]) {
      this.listeners[eventName].forEach(listener => listener(eventData));
    }
  }
}

export const errorEmitter = new EventEmitter();
