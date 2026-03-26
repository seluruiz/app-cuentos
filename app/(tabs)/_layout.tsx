import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1E293B',
          borderTopWidth: 1,
          borderTopColor: '#334155',
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 10),
          height: 60 + Math.max(insets.bottom, 10),
        },
        tabBarActiveTintColor: '#FCD34D',
        tabBarInactiveTintColor: '#64748B',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          marginBottom: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>✨</Text>
          ),
        }}
      />

      <Tabs.Screen
        name="voces"
        options={{
          title: 'Voix',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>🎙️</Text>
          ),
        }}
      />

      <Tabs.Screen
        name="biblioteca"
        options={{
          title: 'Bibliothèque',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>📚</Text>
          ),
        }}
      />
    </Tabs>
  );
}