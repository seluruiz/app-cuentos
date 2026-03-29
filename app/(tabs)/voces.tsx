import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Purchases from 'react-native-purchases';

const STORAGE_KEYS = {
  CUSTOM_VOICES: '@custom_voices_array_v1',
};

const API_BASE_URL = 'https://api.cuentosdream.com';

const UPLOAD_MESSAGES = [
  "Envoi de votre voix au studio 📡...",
  "Analyse de l'intonation 🔍...",
  "Création de votre clone magique ✨...",
  "Encore quelques secondes ⏳...",
];

export default function VocesScreen() {
  const [customVoices, setCustomVoices] = useState([]);
  const [isPremium, setIsPremium] = useState(false);

  // Estados del Paywall
  const [showPaywall, setShowPaywall] = useState(false);
  const [packages, setPackages] = useState([]);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceStep, setVoiceStep] = useState(1);
  const [hasConsent, setHasConsent] = useState(false);
  const [newVoiceName, setNewVoiceName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingObject, setRecordingObject] = useState(null);
  const [recordedUri, setRecordedUri] = useState(null);
  const [previewSound, setPreviewSound] = useState(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(UPLOAD_MESSAGES[0]);
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [voiceToRename, setVoiceToRename] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const timerRef = useRef(null);

  const loadOfferings = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      if (offerings.current?.availablePackages?.length > 0) {
        setPackages(offerings.current.availablePackages);
      }
    } catch (e) {
      console.log('Error loading offerings:', e);
    }
  };

  const purchasePackage = async (pkg) => {
    try {
      setIsPurchasing(true);
      const { customerInfo } = await Purchases.purchasePackage(pkg);
  
      if (customerInfo?.entitlements?.active?.premium) {
        setIsPremium(true);
        setShowPaywall(false);
        Alert.alert('Félicitations ! 🎉', 'Vous êtes maintenant Premium.');
      }
    } catch (e) {
      if (!e?.userCancelled) {
        Alert.alert('Erreur', "Impossible de finaliser l'achat.");
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => {
        if (previewSound) previewSound.unloadAsync().catch(() => {});
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }, [previewSound])
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Efecto para los mensajes dinámicos de carga
  useEffect(() => {
    let interval;
    if (isUploadingVoice) {
      let i = 0;
      setUploadMessage(UPLOAD_MESSAGES[0]);
      interval = setInterval(() => {
        i = (i + 1) % UPLOAD_MESSAGES.length;
        setUploadMessage(UPLOAD_MESSAGES[i]);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isUploadingVoice]);

  const loadData = async () => {
    try {
      const voicesRaw = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_VOICES);
      if (voicesRaw) setCustomVoices(JSON.parse(voicesRaw));
      else setCustomVoices([]);

      if (Platform.OS === 'android') {
        const customerInfo = await Purchases.getCustomerInfo();
        setIsPremium(!!customerInfo?.entitlements?.active?.premium);
        await loadOfferings();
      }
    } catch {}
  };

  const persistVoices = async (voices) => {
    setCustomVoices(voices);
    await AsyncStorage.setItem(STORAGE_KEYS.CUSTOM_VOICES, JSON.stringify(voices));
  };

  const deleteVoice = (voiceId) => {
    Alert.alert('Supprimer cette voix ?', 'Elle ne pourra plus être utilisée pour raconter les histoires.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            const rcUserId = await AsyncStorage.getItem('@app_user_id_v1');
            
            const response = await fetch(`${API_BASE_URL}/api/voice/${voiceId}`, {
              method: 'DELETE',
              headers: {
                 'Content-Type': 'application/json',
                 'x-rc-user-id': rcUserId
              }
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
              throw new Error(data?.error || 'Suppression impossible sur le serveur');
            }
  
            const updatedVoices = customVoices.filter((v) => v.id !== voiceId);
            await persistVoices(updatedVoices);
          } catch (error) {
            Alert.alert("Erreur", error.message || "Impossible de supprimer la voix.");
          }
        },
      },
    ]);
  };

  const openRenameModal = (voice) => {
    setVoiceToRename(voice);
    setRenameValue(voice.name || '');
    setShowRenameModal(true);
  };

  const handleRenameSave = async () => {
    const nextName = renameValue.trim();
    if (!nextName || nextName.length < 2 || !voiceToRename) return;

    const updated = customVoices.map((v) =>
      v.id === voiceToRename.id ? { ...v, name: nextName } : v
    );
    await persistVoices(updated);
    setShowRenameModal(false);
    setVoiceToRename(null);
  };

  const resetVoiceFlow = async () => {
    try {
      if (timerRef.current) clearInterval(timerRef.current);

      if (isRecording && recordingObject) {
        await recordingObject.stopAndUnloadAsync().catch(() => {});
      }

      if (previewSound) {
        await previewSound.unloadAsync().catch(() => {});
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(() => {});
    } catch {}

    setVoiceStep(1);
    setHasConsent(false);
    setNewVoiceName('');
    setIsRecording(false);
    setRecordingObject(null);
    setRecordedUri(null);
    setPreviewSound(null);
    setIsPreviewPlaying(false);
    setIsUploadingVoice(false);
    setRecordingSeconds(0);
  };

  const handleOpenVoiceModal = () => {
    if (!isPremium) {
      setShowPaywall(true); 
      return;
    }
    resetVoiceFlow();
    setShowVoiceModal(true);
  };

  const startRecordingVoice = async () => {
    try {
      if (permissionResponse?.status !== 'granted') {
        const response = await requestPermission();
        if (response.status !== 'granted') {
          Alert.alert('Permission', 'Microphone requis.');
          return;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecordingObject(recording);
      setIsRecording(true);
      setRecordingSeconds(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {}
  };

  const stopRecordingVoice = async () => {
    try {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsRecording(false);

      await recordingObject.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const uri = recordingObject.getURI();
      setRecordedUri(uri);
      setRecordingObject(null);

      if (recordingSeconds < 15) {
        Alert.alert('Enregistrement trop court', 'Minimum recommandé : 15 secondes.');
        setVoiceStep(2);
        return;
      }

      setVoiceStep(3);
    } catch {}
  };

  const playRecordedPreview = async () => {
    if (!recordedUri) return;
    try {
      if (previewSound) {
        await previewSound.unloadAsync().catch(() => {});
        setPreviewSound(null);
      }

      if (isPreviewPlaying) {
        setIsPreviewPlaying(false);
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: recordedUri },
        { shouldPlay: true },
        (status) => {
          if (status.didJustFinish) {
            setIsPreviewPlaying(false);
            sound.unloadAsync().catch(() => {});
          }
        }
      );
      setPreviewSound(sound);
      setIsPreviewPlaying(true);
    } catch {}
  };

  const submitVoiceToServer = async () => {
    if (!recordedUri) return;
    if (recordingSeconds < 15) {
      Alert.alert('Enregistrement trop court', 'Minimum recommandé : 15 secondes.');
      return;
    }

    setIsUploadingVoice(true);
    try {
      const rcUserId = await AsyncStorage.getItem('@app_user_id_v1');
      if (!rcUserId) throw new Error("ID Utilisateur introuvable.");

      const fileExt = recordedUri.split('.').pop() || 'm4a';
      const mimeType =
        fileExt === 'm4a' ? 'audio/m4a' : fileExt === 'mp4' ? 'audio/mp4' : 'audio/wav';

      const formData = new FormData();
      formData.append('voiceName', newVoiceName.trim() || 'Voix Magique');
      formData.append('audio', {
        uri: recordedUri,
        name: `voice_recording.${fileExt}`,
        type: mimeType,
      });

      const response = await fetch(`${API_BASE_URL}/api/voice/clone`, {
        method: 'POST',
        headers: {
          'x-rc-user-id': rcUserId,
        },
        body: formData,
      });

      const textResponse = await response.text();
      let data;
      
      try {
        data = JSON.parse(textResponse);
      } catch (parseError) {
        throw new Error(`Erreur réseau (Code: ${response.status}). Vérifiez votre connexion.`);
      }

      if (!response.ok) throw new Error(data?.error || `Erreur serveur: ${response.status}`);

      if (data.success && data.voiceId) {
        const newVoice = {
          id: data.voiceId,
          name: newVoiceName.trim() || 'Nouvelle Voix',
          subtitle: 'Prête à raconter des histoires',
        };
        const updatedVoices = [...customVoices, newVoice];
        await persistVoices(updatedVoices);
        
        Alert.alert('Félicitations ! 🎉', 'La voix a été clonée avec succès.');
        await resetVoiceFlow();
        setShowVoiceModal(false);
      }
    } catch (error) {
      Alert.alert('Erreur technique', `Motif : ${error.message}`);
      setIsUploadingVoice(false);
    }
  };

  const formatSeconds = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Studio de Voix 🎙️</Text>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>La Magie de votre Voix</Text>
          <Text style={styles.heroText}>
            Créez une voix familière pour raconter ses histoires du soir, même lorsque vous n'êtes pas disponible.
          </Text>
        </View>

        <TouchableOpacity 
          style={[styles.primaryButton, isUploadingVoice && { opacity: 0.6 }]} 
          onPress={handleOpenVoiceModal}
          disabled={isUploadingVoice}
        >
          <Text style={styles.primaryButtonText}>+ Cloner une nouvelle voix</Text>
        </TouchableOpacity>

        <View style={styles.ideasCard}>
          <Text style={styles.ideasTitle}>Idées de voix à créer :</Text>
          <Text style={styles.ideasLine}>👨 Papa pour les histoires du soir</Text>
          <Text style={styles.ideasLine}>👩 Maman pour les siestes</Text>
          <Text style={styles.ideasLine}>👵 Mamie pour les vacances</Text>
          <Text style={styles.ideasLine}>👴 Papi pour les contes drôles</Text>
        </View>

        {customVoices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🎤</Text>
            <Text style={styles.emptyText}>Aucune voix enregistrée pour le moment.</Text>
            <Text style={styles.emptySubtext}>Ajoutez une voix pour rendre les histoires encore plus personnelles.</Text>
          </View>
        ) : (
          <View style={styles.voiceList}>
            <Text style={styles.listTitle}>Vos voix clonées</Text>
            {customVoices.map((voice) => (
              <View key={voice.id} style={styles.voiceListItem}>
                <View style={{ flex: 1 }}>
                  <View style={styles.voiceRowTop}>
                    <View style={styles.voiceIconBg}><Text>🎙️</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.voiceListName}>{voice.name}</Text>
                      <Text style={styles.voiceListSubtitle}>{voice.subtitle || 'Disponible sur l’écran d’accueil'}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.voiceActions}>
                  <TouchableOpacity onPress={() => openRenameModal(voice)} style={styles.smallActionBtn}>
                    <Text style={styles.smallActionText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteVoice(voice.id)} style={styles.smallActionBtn}>
                    <Text style={styles.smallActionText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modal principal de grabación */}
      <Modal visible={showVoiceModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.voiceModalContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
            <TouchableOpacity 
              style={[styles.closeIconBtnCircle, isUploadingVoice && { opacity: 0.5 }]} 
              onPress={async () => {
                if (isUploadingVoice) return;
                await resetVoiceFlow();
                setShowVoiceModal(false);
              }}
            >
              <Text style={styles.closeIconText}>✕</Text>
            </TouchableOpacity>
          </View>

          {voiceStep === 1 && (
            <View style={styles.voiceStepContent}>
              <Text style={styles.voiceModalEmoji}>👤</Text>
              <Text style={styles.voiceModalTitle}>Qui êtes-vous ?</Text>
              <Text style={styles.voiceModalSubtitle}>
                Donnez un nom à cette voix pour la retrouver facilement (ex : Papa, Maman, Mamie...)
              </Text>

              <View style={[styles.inputContainer, { width: '100%', marginBottom: 30 }]}>
                <TextInput 
                  style={styles.input} 
                  placeholder="Ex. Papa" 
                  placeholderTextColor="#64748B" 
                  value={newVoiceName} 
                  onChangeText={setNewVoiceName} 
                />
              </View>

              <View style={styles.legalBox}>
                <Text style={styles.legalBoxText}>
                  🔒 Votre voix est traitée par notre partenaire d'IA sécurisé uniquement pour générer les contes dans cette application.{'\n\n'}
                  Vous pouvez supprimer cette voix plus tard depuis cette page.
                </Text>
              </View>

              <View style={styles.consentRow}>
                <Switch 
                  value={hasConsent} 
                  onValueChange={setHasConsent} 
                  trackColor={{ false: '#334155', true: '#8B5CF6' }} 
                />
                <Text style={styles.consentLabel}>
                  Je confirme que cette voix est la mienne ou que j'ai l'autorisation de l'utiliser. J'accepte son traitement uniquement pour créer des narrations dans cette application.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.modalBtn, 
                  { width: '100%', opacity: hasConsent && newVoiceName.trim().length >= 2 ? 1 : 0.5 }
                ]}
                disabled={!(hasConsent && newVoiceName.trim().length >= 2)}
                onPress={() => setVoiceStep(2)}
              >
                <Text style={styles.modalBtnText}>Continuer</Text>
              </TouchableOpacity>
            </View>
          )}

          {voiceStep === 2 && (
            <View style={styles.voiceStepContent}>
              <Text style={styles.voiceModalEmoji}>🎙️</Text>
              <Text style={styles.voiceModalTitle}>Studio de voix</Text>
              
              <Text style={styles.scriptWarning}>
                🔴 Lisez lentement, à voix basse et avec beaucoup de tendresse (comme si vous lisiez un vrai conte), tout en bordant votre enfant dans son lit.
              </Text>

              <View style={styles.scriptBox}>
                <Text style={styles.scriptText}>
                  "Il était une fois... dans une forêt magique et secrète, un petit renard profondément endormi. Soudain... un bruit très doux le réveilla ! « Qui est là ? » murmura-t-il doucement, en regardant autour de lui. C'était juste le vent... qui chantait une merveilleuse berceuse sous les étoiles brillantes. Rassuré, le petit renard ferma les yeux... respira très calmement... et s'endormit paisiblement dans son nid douillet. Chut... la nuit est là... fais de beaux rêves..."
                </Text>
              </View>

              <View style={{ alignItems: 'center', marginTop: 30 }}>
                <TouchableOpacity 
                  style={[styles.recordCircle, isRecording && styles.recordingActive]} 
                  onPress={isRecording ? stopRecordingVoice : startRecordingVoice}
                >
                  <Text style={{ fontSize: 32 }}>{isRecording ? '⏹️' : '🎤'}</Text>
                </TouchableOpacity>
                <Text style={styles.recordTimer}>{formatSeconds(recordingSeconds)}</Text>
                <Text style={{ color: isRecording ? '#EF4444' : '#94A3B8', marginTop: 10, fontWeight: 'bold' }}>
                  {isRecording ? "Enregistrement en cours..." : 'Appuyez pour parler'}
                </Text>
                
                <Text style={styles.recommendationText}>Idéal : 30-45 secondes</Text>

                {recordingSeconds >= 25 && recordingSeconds < 45 && (
                  <Text style={styles.perfectText}>Parfait, vous pouvez arrêter l’enregistrement.</Text>
                )}
                {recordingSeconds >= 45 && (
                  <Text style={styles.warningText}>Durée suffisante, vous pouvez arrêter l'enregistrement.</Text>
                )}
              </View>
            </View>
          )}

          {voiceStep === 3 && (
            <View style={styles.voiceStepContent}>
              <Text style={styles.voiceModalEmoji}>🎧</Text>
              <Text style={styles.voiceModalTitle}>Vérification</Text>
              <Text style={styles.voiceModalSubtitle}>
                Écoutez votre enregistrement. Si le son est clair, envoyez-le au studio.
              </Text>

              <TouchableOpacity style={styles.previewButton} onPress={playRecordedPreview}>
                <Text style={styles.previewButtonText}>
                  {isPreviewPlaying ? "⏹ Arrêter l'écoute" : '▶️ Écouter mon enregistrement'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ padding: 15, marginTop: 10 }} 
                onPress={() => { setRecordedUri(null); setVoiceStep(2); }} 
                disabled={isUploadingVoice}
              >
                <Text style={{ color: '#94A3B8', textDecorationLine: 'underline' }}>Refaire l'enregistrement</Text>
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              <View style={styles.uploadActionContainer}>
                {isUploadingVoice ? (
                  <View style={styles.audioLoadingContainer}>
                    <ActivityIndicator color="#10B981" size="large" />
                    <Text style={styles.audioLoadingText}>{uploadMessage}</Text>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={[styles.modalBtn, { width: '100%', backgroundColor: '#10B981' }]} 
                    onPress={submitVoiceToServer} 
                  >
                    <Text style={styles.modalBtnText}>✨ Générer ma voix magique</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Modal para renombrar voz */}
      <Modal visible={showRenameModal} animationType="fade" transparent>
        <View style={styles.renameOverlay}>
          <View style={styles.renameContent}>
            <Text style={styles.renameTitle}>Renommer la voix</Text>
            <Text style={styles.renameSubtitle}>Choisissez un nouveau nom.</Text>
            
            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Ex. Papa"
              placeholderTextColor="#64748B"
              autoFocus
            />

            <View style={styles.renameActions}>
              <TouchableOpacity 
                style={styles.renameCancelBtn} 
                onPress={() => {
                  setShowRenameModal(false);
                  setVoiceToRename(null);
                }}
              >
                <Text style={styles.renameCancelText}>Annuler</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.renameSaveBtn, renameValue.trim().length < 2 && { opacity: 0.5 }]}
                disabled={renameValue.trim().length < 2}
                onPress={handleRenameSave}
              >
                <Text style={styles.renameSaveText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* NUEVO PAYWALL PREMIUM */}
      <Modal visible={showPaywall} animationType="slide" transparent>
        <View style={styles.pwOverlay}>
          <View style={styles.pwContent}>
            <TouchableOpacity style={styles.pwClose} onPress={() => setShowPaywall(false)}>
              <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 55, marginBottom: 10 }}>✨</Text>
            <Text style={styles.pwTitle}>Passez au Premium</Text>
            <Text style={styles.pwSub}>
              Débloquez la magie illimitée !{'\n'}• Histoires à l'infini{'\n'}• Clonez votre propre voix{'\n'}• Accès à toutes les voix magiques
            </Text>

            {packages.length > 0 ? (
              packages.map((pkg) => (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={styles.pwBtnPremium}
                  onPress={() => purchasePackage(pkg)}
                  disabled={isPurchasing}
                >
                  {isPurchasing ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Text style={styles.pwBtnPremiumTitle}>
                         {pkg.packageType === 'MONTHLY' ? '🎁 Essai gratuit' : '🚀 Plan Annuel'}
                      </Text>
                      <Text style={styles.pwBtnPremiumPrice}>Puis {pkg.product.priceString}</Text>
                    </>
                  )}
                </TouchableOpacity>
              ))
            ) : (
              <View style={{ marginTop: 20, alignItems: 'center' }}>
                <ActivityIndicator color="#FCD34D" size="large" />
                <Text style={{ color: '#94A3B8', marginTop: 15, textAlign: 'center' }}>Recherche des meilleures offres...</Text>
                <TouchableOpacity style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#334155', borderRadius: 12 }} onPress={loadOfferings}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Réessayer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', paddingTop: 60 },
  headerTitle: { fontSize: 34, fontWeight: '900', color: '#FCD34D', textAlign: 'center', marginBottom: 20 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 150 },
  heroCard: { backgroundColor: '#1E293B', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: '#334155', marginBottom: 20 },
  heroTitle: { color: '#F8FAFC', fontSize: 22, fontWeight: '900', marginBottom: 10 },
  heroText: { color: '#94A3B8', fontSize: 15, lineHeight: 24, textAlign: 'justify' },
  primaryButton: { backgroundColor: '#8B5CF6', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 24, shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  primaryButtonText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  ideasCard: { borderWidth: 1, borderColor: '#334155', borderStyle: 'dashed', borderRadius: 24, padding: 20, marginBottom: 24 },
  ideasTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '800', marginBottom: 12 },
  ideasLine: { color: '#94A3B8', fontSize: 14, marginBottom: 8 },
  emptyContainer: { alignItems: 'center', marginTop: 30, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 50, marginBottom: 15 },
  emptyText: { color: '#F8FAFC', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  emptySubtext: { color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  voiceList: { marginTop: 10 },
  listTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '800', marginBottom: 15 },
  voiceListItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E293B', padding: 15, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  voiceRowTop: { flexDirection: 'row', alignItems: 'center' },
  voiceIconBg: { backgroundColor: '#0F172A', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  voiceListName: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  voiceListSubtitle: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  voiceActions: { flexDirection: 'row', gap: 8 },
  smallActionBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155' },
  smallActionText: { fontSize: 16 },
  
  voiceModalContainer: { flex: 1, backgroundColor: '#0F172A', padding: 24, paddingTop: 40, paddingBottom: 50 },
  closeIconBtnCircle: { backgroundColor: '#334155', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  closeIconText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  voiceStepContent: { flex: 1, alignItems: 'center' },
  voiceModalEmoji: { fontSize: 60, marginBottom: 15 },
  voiceModalTitle: { color: '#FCD34D', fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  voiceModalSubtitle: { color: '#CBD5E1', fontSize: 15, textAlign: 'center', marginBottom: 10, lineHeight: 22 },
  voiceModalWarning: { color: '#94A3B8', fontSize: 12, textAlign: 'center', marginBottom: 25, fontStyle: 'italic' },
  
  // NUEVO ESTILO PARA EL AVISO EN ROJO
  scriptWarning: { color: '#EF4444', fontSize: 14, fontWeight: '800', textAlign: 'center', marginBottom: 15, lineHeight: 22, paddingHorizontal: 10 },
  
  inputContainer: { backgroundColor: '#1E293B', borderRadius: 16, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 15 },
  input: { color: '#FFF', paddingVertical: 15, fontSize: 16 },
  legalBox: { backgroundColor: '#1E293B', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#334155', marginBottom: 20, width: '100%' },
  legalBoxText: { color: '#94A3B8', fontSize: 13, lineHeight: 20, textAlign: 'justify' },
  consentRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 30, paddingHorizontal: 10 },
  consentLabel: { flex: 1, color: '#F8FAFC', fontSize: 13, marginLeft: 15, fontWeight: '600', lineHeight: 20 },
  modalBtn: { backgroundColor: '#8B5CF6', borderRadius: 18, minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { color: '#FFF', fontWeight: '800', fontSize: 17 },
  scriptBox: { backgroundColor: '#1E293B', padding: 25, borderRadius: 20, borderWidth: 1, borderColor: '#8B5CF6', width: '100%' },
  scriptText: { color: '#F8FAFC', fontSize: 16, lineHeight: 28, textAlign: 'center', fontStyle: 'italic', fontWeight: '500' },
  recordCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#0F172A' },
  recordingActive: { backgroundColor: '#EF4444', borderColor: '#FCA5A5', transform: [{ scale: 1.1 }] },
  recordTimer: { color: '#FCD34D', fontSize: 24, fontWeight: '900', marginTop: 16 },
  recommendationText: { color: '#64748B', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  perfectText: { color: '#10B981', marginTop: 8, fontWeight: '700' },
  warningText: { color: '#F59E0B', marginTop: 8, fontWeight: '700' },
  previewButton: { backgroundColor: '#334155', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 16, width: '100%', alignItems: 'center', marginTop: 20 },
  previewButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  uploadActionContainer: { width: '100%', paddingBottom: 10, marginTop: 20 },
  audioLoadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', width: '100%' },
  audioLoadingText: { color: '#10B981', fontWeight: '800', fontSize: 15, marginTop: 12, textAlign: 'center' },
  renameOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  renameContent: { backgroundColor: '#1E293B', width: '100%', borderRadius: 24, padding: 25, borderWidth: 1, borderColor: '#334155' },
  renameTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  renameSubtitle: { color: '#94A3B8', fontSize: 14, marginBottom: 20 },
  renameInput: { backgroundColor: '#0F172A', color: '#FFF', borderRadius: 12, padding: 15, fontSize: 16, borderWidth: 1, borderColor: '#334155', marginBottom: 24 },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  renameCancelBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  renameCancelText: { color: '#94A3B8', fontWeight: '700', fontSize: 15 },
  renameSaveBtn: { backgroundColor: '#8B5CF6', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  renameSaveText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  pwOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.95)', justifyContent: 'center', padding: 20 },
  pwContent: { backgroundColor: '#1E293B', borderRadius: 32, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#8B5CF6', shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  pwClose: { position: 'absolute', top: 20, right: 20, width: 32, height: 32, backgroundColor: '#334155', borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  pwTitle: { color: '#FFF', fontSize: 26, fontWeight: '900', textAlign: 'center' },
  pwSub: { color: '#CBD5E1', textAlign: 'center', marginVertical: 20, lineHeight: 24, fontSize: 15 },
  pwBtnPremium: { backgroundColor: '#8B5CF6', width: '100%', padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 12, shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 },
  pwBtnPremiumTitle: { color: '#FFF', fontWeight: '900', fontSize: 18 },
  pwBtnPremiumPrice: { color: '#E2E8F0', marginTop: 4, fontSize: 14, fontWeight: '600' },
});