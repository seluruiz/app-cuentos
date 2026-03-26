import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Text } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1E293B',
          borderTopWidth: 1,
          borderTopColor: '#334155',
          paddingTop: 6,
          paddingBottom: Platform.OS === 'android' ? 12 : 6,
          height: Platform.OS === 'android' ? 72 : 64,
        },
        tabBarActiveTintColor: '#FCD34D',
        tabBarInactiveTintColor: '#64748B',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          marginBottom: Platform.OS === 'android' ? 4 : 0,
        },
        tabBarItemStyle: {
          paddingVertical: Platform.OS === 'android' ? 4 : 0,
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