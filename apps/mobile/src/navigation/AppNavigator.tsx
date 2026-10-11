import Ionicons from '@expo/vector-icons/Ionicons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, type ComponentProps } from 'react';
import { Pressable, Text } from 'react-native';

import { useAlerts, useHomes } from '../api/hooks';
import { Loading } from '../components/ui';
import { AUTH_ENABLED } from '../config';
import { authSession, useAuth } from '../auth/runtime';
import { hasOwnedSelection } from '../auth/policy';
import { AuthScreen } from '../features/auth/AuthScreen';
import { AlertsScreen, unreadCount } from '../features/alerts/AlertsScreen';
import { api } from '../api/client';
import { nativeDeps, registerForPush } from '../notifications/push';
import { BillFormScreen } from '../features/bills/BillFormScreen';
import { BillOcrScreen } from '../features/bills/BillOcrScreen';
import { BillsScreen } from '../features/bills/BillsScreen';
import { BillDetailScreen } from '../features/bills/detail/BillDetailScreen';
import { BillItemsEditorScreen } from '../features/bills/detail/BillItemsEditorScreen';
import { ConsumptionScreen } from '../features/consumption/ConsumptionScreen';
import { initialRangeFromParams } from '../features/consumption/range';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { EquipmentFormScreen } from '../features/equipment/EquipmentFormScreen';
import { EquipmentScreen } from '../features/equipment/EquipmentScreen';
import { GoalFormScreen } from '../features/goals/GoalFormScreen';
import { HomesScreen } from '../features/homes/HomesScreen';
import { OnboardingScreen } from '../features/homes/OnboardingScreen';
import { OutageFormScreen } from '../features/outages/OutageFormScreen';
import { OutagesScreen } from '../features/outages/OutagesScreen';
import { SavingsScreen } from '../features/savings/SavingsScreen';
import { ReadingFormScreen } from '../features/readings/ReadingFormScreen';
import { ReadingsScreen } from '../features/readings/ReadingsScreen';
import { useSession } from '../store/session';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { HomeProfileScreen } from '../features/profile/HomeProfileScreen';
import { ServiceProfileScreen } from '../features/profile/ServiceProfileScreen';
import { AccountSettingsScreen } from '../features/profile/AccountSettingsScreen';
import { ShareHomeScreen } from '../features/profile/ShareHomeScreen';
import { colors, TOUCH } from '../theme';

export type RootStackParams = {
  Tabs: undefined;
  BillForm: undefined;
  BillOcr: undefined;
  BillDetail: { homeId: string; billId: string; saved?: boolean };
  BillItemsEditor: { homeId: string; billId: string };
  EquipmentForm: { equipmentId?: string } | undefined;
  Homes: undefined;
  Readings: undefined;
  ReadingForm: undefined;
  GoalForm: undefined;
  Profile: undefined;
  HomeProfile: undefined;
  ServiceProfile: undefined;
  AccountSettings: undefined;
  ShareHome: undefined;
  Savings: undefined;
  Outages: undefined;
  OutageForm: { outageId?: string } | undefined;
};
// 5 pestañas: cambiar de vivienda es poco frecuente y vive en el encabezado (hoja "Homes").
export type TabParams = { Dashboard: undefined; Consumption: { from?: string; to?: string; granularity?: string } | undefined; Bills: undefined; Equipment: undefined; Alerts: undefined };

const AccountStack = createNativeStackNavigator<{ Account: undefined; AccountHomes: undefined }>();
const Stack = createNativeStackNavigator<RootStackParams>();
const Tab = createBottomTabNavigator<TabParams>();

type IconName = ComponentProps<typeof Ionicons>['name'];
const TAB_ICONS: Record<keyof TabParams, [IconName, IconName]> = {
  Dashboard: ['home', 'home-outline'],
  Consumption: ['bar-chart', 'bar-chart-outline'],
  Bills: ['receipt', 'receipt-outline'],
  Equipment: ['flash', 'flash-outline'],
  Alerts: ['notifications', 'notifications-outline'],
};

/** Botón del encabezado con la vivienda activa: un toque para cambiarla. */
function HomeSwitcherButton({ onPress }: { onPress: () => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const home = useHomes().data?.find((h) => h.id === homeId);
  const label = home ? home.name.replace(' (demo)', '') : 'Elegir vivienda';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Vivienda: ${label}. Cambiar vivienda`}
      testID="home-switcher"
      hitSlop={8}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        minHeight: TOUCH,
        paddingHorizontal: 8,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name="business-outline" size={16} color={colors.primary} />
      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15, maxWidth: 200 }} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={14} color={colors.muted} />
    </Pressable>
  );
}

function Tabs({ navigation }: NativeStackScreenProps<RootStackParams, 'Tabs'>) {
  const homeId = useSession((st) => st.selectedHomeId);
  const unread = unreadCount(useAlerts(homeId).data);
  const openHomes = () => navigation.navigate('Homes');
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        headerTitleAlign: 'center',
        tabBarButtonTestID: `tab-${route.name}`,
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={TAB_ICONS[route.name][focused ? 0 : 1]} size={size} color={color} />
        ),
        headerTitle: () => <HomeSwitcherButton onPress={openHomes} />,
        headerRight: route.name === 'Dashboard' ? () => <Pressable testID="profile-entry" accessibilityRole="button" accessibilityLabel="Abrir Perfil" onPress={() => navigation.navigate('Profile')} style={{ minHeight: TOUCH, minWidth: TOUCH, justifyContent: 'center', paddingHorizontal: 12 }}><Ionicons name="person-circle-outline" size={26} color={colors.primary} /></Pressable> : undefined,
      })}
    >
      <Tab.Screen name="Dashboard" options={{ title: 'Inicio' }}>
        {({ navigation: tabs }) => (
          <DashboardScreen
            onAddBill={() => navigation.navigate('BillForm')}
            onOpenAlerts={() => tabs.navigate('Alerts')}
            onOpenSavings={() => navigation.navigate('Savings')}
            onAddReading={() => navigation.navigate('ReadingForm')}
            onEditGoal={() => navigation.navigate('GoalForm')}
            onInvestigate={(range) => tabs.navigate('Consumption', range)}
            onOpenBill={(homeId, billId) => navigation.navigate('BillDetail', { homeId, billId })}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="Consumption" options={{ title: 'Consumo' }}>
        {({ route }) => (
          <ConsumptionScreen
            initialRange={initialRangeFromParams(route.params)}
            onAddReading={() => navigation.navigate('ReadingForm')}
            onOpenReadings={() => navigation.navigate('Readings')}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="Bills" options={{ title: 'Facturas' }}>
        {() => <BillsScreen onAdd={() => navigation.navigate('BillForm')} onOpen={(homeId, billId) => navigation.navigate('BillDetail', { homeId, billId })} />}
      </Tab.Screen>
      <Tab.Screen name="Equipment" options={{ title: 'Equipos' }}>
        {() => (
          <EquipmentScreen
            onAdd={() => navigation.navigate('EquipmentForm')}
            onEdit={(equipmentId) => navigation.navigate('EquipmentForm', { equipmentId })}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="Alerts" options={{ title: 'Alertas', tabBarBadge: unread > 0 ? unread : undefined }}>
        {({ navigation: tabs }) => (
          <AlertsScreen
            onOpenBill={(billId) => homeId && navigation.navigate('BillDetail', { homeId, billId })}
            onNewBill={() => navigation.navigate('BillForm')}
            onNewReading={() => navigation.navigate('ReadingForm')}
            onHome={() => tabs.navigate('Dashboard')}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const account = useAuth();
  useEffect(() => { if (AUTH_ENABLED) void authSession.hydrate(); }, []);
  if (!AUTH_ENABLED) return <LegacyApp />;
  if (account.status === 'hydrating') return <Loading label="Verificando sesión…" />;
  if (account.status !== 'authenticated') return <NavigationContainer key="account">
    <AccountStack.Navigator><AccountStack.Screen name="Account" component={AuthScreen} options={{ headerShown: false }} /></AccountStack.Navigator>
  </NavigationContainer>;
  return <AuthenticatedApp key={account.epoch} />;
}

function AuthenticatedApp() {
  const homes = useHomes();
  // ERD-ALERT-02: si ya hay permiso de notificaciones, este teléfono se registra para los avisos; nunca se pregunta aquí.
  useEffect(() => { void nativeDeps(api).then((deps) => registerForPush(deps, { ask: false })).catch(() => undefined); }, []);
  const selected = useSession((st) => st.selectedHomeId);
  const ownsSelection = hasOwnedSelection(selected, homes.data ?? []);
  useEffect(() => {
    if (homes.isSuccess && selected && !ownsSelection) useSession.getState().reset();
  }, [homes.isSuccess, selected, ownsSelection]);
  if (!ownsSelection) return <NavigationContainer key="choose-own-home">
    <AccountStack.Navigator><AccountStack.Screen name="AccountHomes" options={{ title: 'Mis viviendas' }}>
      {() => <HomesScreen onPicked={() => useSession.getState().completeOnboarding()} />}
    </AccountStack.Screen></AccountStack.Navigator>
  </NavigationContainer>;
  return <DomainNavigator />;
}

function LegacyApp() {
  const hydrated = useSession((st) => st.hydrated);
  const onboardingDone = useSession((st) => st.onboardingDone);
  const hydrate = useSession((st) => st.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) return <Loading label="Iniciando…" />;
  if (!onboardingDone) return <OnboardingScreen />;
  return <DomainNavigator />;
}

function DomainNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="BillForm" options={{ title: 'Nueva factura' }}>
          {({ navigation }) => <BillFormScreen onDone={() => navigation.goBack()} onOcr={() => navigation.navigate('BillOcr')} />}
        </Stack.Screen>
        <Stack.Screen name="BillOcr" options={{ title: 'Leer factura' }}>
          {({ navigation }) => <BillOcrScreen onManual={() => navigation.navigate('BillForm')} onDone={() => navigation.popTo('Tabs')} />}
        </Stack.Screen>
        <Stack.Screen name="BillDetail" options={{ title: 'Detalle de factura' }}>
          {({ navigation, route }) => (
            <BillDetailScreen
              homeId={route.params.homeId}
              billId={route.params.billId}
              saved={route.params.saved}
              onEdit={() => navigation.navigate('BillItemsEditor', { homeId: route.params.homeId, billId: route.params.billId })}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="BillItemsEditor" options={{ title: 'Editar ítems' }}>
          {({ navigation, route }) => (
            <BillItemsEditorScreen
              homeId={route.params.homeId}
              billId={route.params.billId}
              onSaved={() => navigation.popTo('BillDetail', { homeId: route.params.homeId, billId: route.params.billId, saved: true })}
            />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="EquipmentForm"
          options={({ route }) => ({ title: route.params?.equipmentId ? 'Editar equipo' : 'Nuevo equipo' })}
        >
          {({ navigation, route }) => (
            <EquipmentFormScreen equipmentId={route.params?.equipmentId} onDone={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Readings" options={{ title: 'Lecturas del medidor' }}>
          {({ navigation }) => <ReadingsScreen onAdd={() => navigation.navigate('ReadingForm')} />}
        </Stack.Screen>
        <Stack.Screen name="ReadingForm" options={{ title: 'Nueva lectura' }}>
          {({ navigation }) => <ReadingFormScreen onDone={() => navigation.goBack()} />}
        </Stack.Screen>
        <Stack.Screen name="Savings" options={{ title: 'Ahorro' }}>
          {({ navigation }) => (
            <SavingsScreen
              onEquipment={() => navigation.navigate('Tabs', { screen: 'Equipment' } as never)}
              onGoal={() => navigation.navigate('GoalForm')}
              onAlerts={() => navigation.navigate('Tabs', { screen: 'Alerts' } as never)}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Outages" options={{ title: 'Apagones' }}>
          {({ navigation }) => <OutagesScreen onAdd={() => navigation.navigate('OutageForm')} onEdit={(outageId) => navigation.navigate('OutageForm', { outageId })} />}
        </Stack.Screen>
        <Stack.Screen name="OutageForm" options={({ route }) => ({ title: route.params?.outageId ? 'Editar apagón' : 'Nuevo apagón' })}>
          {({ navigation, route }) => <OutageFormScreen outageId={route.params?.outageId} onDone={() => navigation.goBack()} />}
        </Stack.Screen>
        <Stack.Screen name="GoalForm" options={{ title: 'Meta mensual' }}>
          {({ navigation }) => <GoalFormScreen onDone={() => navigation.goBack()} />}
        </Stack.Screen>
        <Stack.Screen name="Profile" options={{ title: 'Perfil' }}>
          {({ navigation }) => <ProfileScreen onHome={() => navigation.navigate('HomeProfile')} onService={() => navigation.navigate('ServiceProfile')} onHomes={() => navigation.navigate('Homes')} onAccountSettings={() => navigation.navigate('AccountSettings')} onShare={() => navigation.navigate('ShareHome')} onOutages={() => navigation.navigate('Outages')} />}
        </Stack.Screen>
        <Stack.Screen name="HomeProfile" component={HomeProfileScreen} options={{ title: 'Mi vivienda' }} />
        <Stack.Screen name="ServiceProfile" component={ServiceProfileScreen} options={{ title: 'Mi servicio' }} />
        <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} options={{ title: 'Ajustes de cuenta' }} />
        <Stack.Screen name="ShareHome" component={ShareHomeScreen} options={{ title: 'Compartir vivienda' }} />
        <Stack.Screen name="Homes" options={{ title: 'Elegir vivienda', presentation: 'modal' }}>
          {({ navigation }) => <HomesScreen onPicked={() => navigation.goBack()} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
