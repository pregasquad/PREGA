import { useState, useEffect } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
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
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        setIsSupported(true);
        
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        } catch (e) {
          console.log('Service worker not ready yet');
        }
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

      const response = await fetch('/api/push/vapid-public-key', { credentials: 'include' });
      const data = await response.json();
      const publicKey = data.publicKey;
      
      console.log('VAPID public key received:', publicKey);
      console.log('Key length:', publicKey?.length);
      
      if (!publicKey || publicKey.length < 80) {
        throw new Error('Invalid VAPID public key from server');
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

  const testNotification = async () => {
    try {
      await fetch('/api/push/test', { method: 'POST', credentials: 'include' });
      toast({ 
        title: t("common.success"), 
        description: "Test notification sent!",
        variant: "default"
      });
    } catch (error: any) {
      toast({ 
        title: t("common.error"), 
        description: error.message,
        variant: "destructive"
      });
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isSubscribed ? "default" : "outline"}
        size="sm"
        onClick={isSubscribed ? unsubscribe : subscribe}
        disabled={isLoading}
        className="gap-2"
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
      {isSubscribed && (
        <Button
          variant="ghost"
          size="sm"
          onClick={testNotification}
        >
          Test
        </Button>
      )}
    </div>
  );
}
