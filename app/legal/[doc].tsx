import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  type LegalDocumentId,
  getLegalDocumentConfig,
} from '@/features/legal/legal-documents';
import { useTheme } from '@/features/theme/theme-context';

type ThemeColors = ReturnType<typeof useTheme>['colors'];

export default function LegalDocumentScreen() {
  const { doc } = useLocalSearchParams<{ doc?: string | string[] }>();
  const documentId = getDocumentId(doc);
  const documentConfig = documentId ? getLegalDocumentConfig(documentId) : null;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDocument() {
      if (!documentConfig) {
        setError('Document not found.');
        setContent(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        if (!documentConfig.asset.downloaded) {
          await documentConfig.asset.downloadAsync();
        }
        const uri = documentConfig.asset.localUri ?? documentConfig.asset.uri;
        if (!uri) {
          throw new Error('Document URI is missing.');
        }
        const text = await readDocument(uri);
        if (!cancelled) {
          setContent(text.replace(/\r\n/g, '\n'));
        }
      } catch (loadError) {
        console.warn('Failed to load legal document', loadError);
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load this document. Please try again later.'
          );
          setContent(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDocument();

    return () => {
      cancelled = true;
    };
  }, [documentConfig]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.container}>
          {loading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.helperText}>Loading document…</Text>
            </View>
          ) : error ? (
            <View style={styles.centerContent}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.documentText}>{content}</Text>
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </>
  );
}

function getDocumentId(param?: string | string[]): LegalDocumentId | null {
  const value = Array.isArray(param) ? param[0] : param;
  if (!value) {
    return null;
  }
  return isDocumentId(value) ? value : null;
}

function isDocumentId(value: string | undefined): value is LegalDocumentId {
  return value === 'privacy' || value === 'terms';
}

async function readDocument(uri: string) {
  if (uri.startsWith('file://')) {
    return await FileSystem.readAsStringAsync(uri);
  }
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Unable to load document (HTTP ${response.status}).`);
  }
  return await response.text();
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    helperText: {
      marginTop: 12,
      fontSize: 16,
      color: colors.mutedText,
      textAlign: 'center',
    },
    errorText: {
      fontSize: 16,
      color: colors.danger,
      textAlign: 'center',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    documentText: {
      fontSize: 16,
      lineHeight: 24,
      color: colors.text,
    },
  });
}
