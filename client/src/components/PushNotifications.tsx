import { useState, useEffect } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  if (!base64String || typeof base64String !== 'string') {
    throw new Error('Invalid base64 string provided');
  }
  
  // Remove any whitespace
  const cleanedBase64 = base64String.trim();
  
  // Add padding if needed
  const padding = '='.repeat((4 - cleanedBase64.length % 4) % 4);
  const base64 = (cleanedBase64 + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  // VAPID public key should be 65 bytes
  if (outputArray.length !== 65) {
    console.error('Invalid VAPID key length:', outputArray.length, 'expected 65');
  }
  
  return outputArray;
}

export function PushNotifications() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const checkSupport = async () => {
      const hasSW = 'serviceWorker' in navigator;
      const hasPush = 'PushManager' in window;
      const hasNotification = 'Notification' in window;
      
      console.log('[Push] Support check:', { hasSW, hasPush, hasNotification });
      
      if (hasSW && hasPush && hasNotification) {
        setIsSupported(true);
        
        try {
          const registration = await navigator.serviceWorker.ready;
          console.log('[Push] Service worker ready:', registration.scope);
          const subscription = await registration.pushManager.getSubscription();
          console.log('[Push] Existing subscription:', !!subscription);
          setIsSubscribed(!!subscription);
        } catch (e) {
          console.log('[Push] Service worker not ready yet:', e);
        }
      } else {
        console.log('[Push] Not supported - add app to Home Screen on iOS 16.4+');
      }
    };
    checkSupport();
  }, []);

  const subscribe = async () => {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Clear any existing subscription first (important for key changes)
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        console.log('Clearing old subscription...');
        await existingSubscription.unsubscribe();
      }
      
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast({ 
          title: t("common.error"), 
          description: "Notification permission denied",
          variant: "destructive"
        });
        return;
      }

      const response = await fetch('/api/push/vapid-public-key', { 
        credentials: 'include',
        cache: 'no-store'  // Prevent caching
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      
      const text = await response.text();
      console.log('Raw response:', text);
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
      }
      
      const publicKey = data.publicKey;
      
      console.log('VAPID public key received:', publicKey);
      console.log('Key length:', publicKey?.length);
      
      if (!publicKey) {
        throw new Error('No VAPID public key in response');
      }
      
      if (publicKey.length < 80) {
        throw new Error(`VAPID key too short: ${publicKey.length} chars`);
      }

      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      console.log('Converted key bytes:', applicationServerKey.length);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });

      console.log('Subscription created:', subscription.endpoint);

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
        credentials: 'include'
      });

      setIsSubscribed(true);
      toast({ 
        title: t("common.success"), 
        description: "Push notifications enabled!",
        variant: "default"
      });
    } catch (error: any) {
      console.error('Push subscription error:', error);
      toast({ 
        title: t("common.error"), 
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          credentials: 'include'
        });
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      toast({ 
        title: t("common.success"), 
        description: "Push notifications disabled",
        variant: "default"
      });
    } catch (error: any) {
      toast({ 
        title: t("common.error"), 
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isSubscribed ? "default" : "outline"}
        size="sm"
        onClick={isSupported ? (isSubscribed ? unsubscribe : subscribe) : undefined}
        disabled={isLoading || !isSupported}
        className="gap-2"
        title={!isSupported ? "Add to Home Screen to enable notifications" : undefined}
      >
        {isLoading ? (
          <BellRing className="w-4 h-4 animate-pulse text-black fill-black" />
        ) : isSubscribed ? (
          <Bell className="w-4 h-4 text-black fill-black" />
        ) : (
          <BellOff className="w-4 h-4 text-black" />
        )}
        {isSubscribed ? "On" : "Off"}
      </Button>
    </div>
  );
}
