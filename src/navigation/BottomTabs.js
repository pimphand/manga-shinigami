import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import HomeScreen from '../screens/HomeScreen';
import MangaScreen from '../screens/MangaScreen';
import LibraryScreen from '../screens/LibraryScreen';
import DetailScreen from '../screens/DetailScreen';
import ReaderScreen from '../screens/ReaderScreen';
import SettingsScreen from '../screens/SettingsScreen';
import colors from '../theme';

const HomeStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Satu sumber untuk semua tab: tambah atau ubah tab cukup di sini.
const TABS = [
  { name: 'Home', component: HomeStackScreen, icon: 'home-outline' },
  { name: 'Komik', component: MangaScreen, icon: 'book-outline' },
  { name: 'Pustaka', component: LibraryScreen, icon: 'bookmark-outline' },
  { name: 'Pengaturan', component: SettingsScreen, icon: 'settings-outline' },
];

const BAR_CONTENT_HEIGHT = 56;

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="Detail" component={DetailScreen} />
      <HomeStack.Screen name="Reader" component={ReaderScreen} />
    </HomeStack.Navigator>
  );
}

export default function BottomTabs() {
  const insets = useSafeAreaInsets();

  const screenOptions = {
    headerShown: false,
    tabBarStyle: {
      height: BAR_CONTENT_HEIGHT + insets.bottom,
      paddingBottom: insets.bottom,
      paddingTop: 6,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.secondaryBackground,
    },
    tabBarActiveTintColor: colors.accent,
    tabBarInactiveTintColor: colors.inactive,
    tabBarLabelStyle: { fontSize: 11 },
  };

  return (
    <Tab.Navigator screenOptions={screenOptions}>
      {TABS.map(({ name, component, icon }) => (
        <Tab.Screen
          key={name}
          name={name}
          component={component}
          options={({ route }) => {
            const focused = getFocusedRouteNameFromRoute(route) ?? 'HomeMain';
            const hideBar = name === 'Home' && focused !== 'HomeMain';
            return {
              tabBarIcon: ({ color, size }) => (
                <Ionicons name={icon} size={size} color={color} />
              ),
              tabBarStyle: hideBar ? { display: 'none' } : screenOptions.tabBarStyle,
            };
          }}
        />
      ))}
    </Tab.Navigator>
  );
}
