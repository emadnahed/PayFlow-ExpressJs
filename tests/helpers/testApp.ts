import { Application } from 'express';
import { createApp } from '../../src/app';

let testApp: Application | null = null;

export const getTestApp = (): Application => {
  if (!testApp) {
    testApp = createApp();
  }
  return testApp;
};

export const resetTestApp = (): void => {
  testApp = null;
};
