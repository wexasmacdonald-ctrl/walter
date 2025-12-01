import React from 'react';
import { Platform } from 'react-native';

import { StopLocationEditor as StopLocationEditorNative } from './StopLocationEditor.native';
import { StopLocationEditor as StopLocationEditorWeb } from './StopLocationEditor.web';
import type { StopLocationEditorProps } from './StopLocationEditor.types';

export function StopLocationEditor(props: StopLocationEditorProps) {
  if (Platform.OS === 'web') {
    return <StopLocationEditorWeb {...props} />;
  }
  return <StopLocationEditorNative {...props} />;
}

export type { StopLocationEditorProps } from './StopLocationEditor.types';
