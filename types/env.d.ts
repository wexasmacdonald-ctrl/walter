declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_GOOGLE_API_KEY?: string;
      GOOGLE_API_KEY?: string;
    }
  }
}

export {};
