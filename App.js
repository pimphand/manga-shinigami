import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { LibraryProvider } from './src/context/LibraryContext';
import BottomTabs from './src/navigation/BottomTabs';

export default function App() {
  const [fontsLoaded] = useFonts(Ionicons.font);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <LibraryProvider>
        <NavigationContainer>
          <BottomTabs />
        </NavigationContainer>
      </LibraryProvider>
    </SafeAreaProvider>
  );
}
