import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

const REVENUECAT_API_KEY = 'goog_AFLbHJIDUEYUXKCHzsdoWuabRCK';
const STORAGE_KEY_APP_USER_ID = '@app_user_id_v1';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Encendemos RevenueCat a nivel global nada más abrir la app
  useEffect(() => {
    const initRevenueCatGlobal = async () => {
      try {
        if (Platform.OS !== 'android') return;
  
        let appUserId = await AsyncStorage.getItem(STORAGE_KEY_APP_USER_ID);
        if (!appUserId) {
          appUserId = `cd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
          await AsyncStorage.setItem(STORAGE_KEY_APP_USER_ID, appUserId);
        }
  
        try {
          await Purchases.getCustomerInfo();
          console.log('RevenueCat ya estaba disponible.');
        } catch {
          await Purchases.configure({
            apiKey: REVENUECAT_API_KEY,
            appUserID: appUserId,
          });
          console.log('RevenueCat configurado globalmente con éxito.');
        }
      } catch (error) {
        console.error('Error al configurar RevenueCat en RootLayout:', error);
      }
    };
  
    initRevenueCatGlobal();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}