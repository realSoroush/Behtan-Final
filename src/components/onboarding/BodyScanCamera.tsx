import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Loader2,
  RefreshCw,
  SwitchCamera,
} from 'lucide-react';
import { captureBodyScanFrame, BodyScanImageError } from '@/utils/bodyScanImage';
import { toPersianDigits } from '@/utils/nutritionHelpers';

type CameraFacingMode = 'user' | 'environment';
type CameraStatus =
  | 'requesting'
  | 'active'
  | 'paused'
  | 'denied'
  | 'unavailable'
  | 'unsupported'
  | 'error';

interface BodyScanCameraProps {
  consentGranted: boolean;
  onCapture: (imageDataUrl: string) => void;
}

function cameraErrorStatus(error: unknown): {
  status: Exclude<CameraStatus, 'requesting' | 'active' | 'paused'>;
  message: string;
} {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return {
        status: 'denied',
        message: 'دسترسی دوربین داده نشد. از تنظیمات مرورگر اجازه Camera را فعال کنید یا عکس آپلود کنید.',
      };
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return {
        status: 'unavailable',
        message: 'دوربین سازگار روی این دستگاه پیدا نشد. می‌توانید عکس تمام‌قد آپلود کنید.',
      };
    }
    if (error.name === 'NotReadableError' || error.name === 'AbortError') {
      return {
        status: 'error',
        message: 'دوربین در دسترس نیست؛ احتمالاً برنامه دیگری از آن استفاده می‌کند.',
      };
    }
  }

  return {
    status: 'error',
    message: 'باز کردن دوربین ممکن نشد. دوباره تلاش کنید یا عکس تمام‌قد آپلود کنید.',
  };
}

function BodyPoseGuide() {
  return (
    <svg
      viewBox="0 0 300 430"
      className="pointer-events-none absolute left-2 top-12 z-10 h-[calc(100%-7.75rem)] w-[calc(100%-1rem)] text-primary-300 drop-shadow-[0_0_3px_rgba(0,0,0,0.85)]"
      aria-hidden="true"
    >
      <ellipse
        cx="150"
        cy="49"
        rx="23"
        ry="29"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="8 7"
      />
      <path
        d="M137 80 C137 94 132 98 116 105 L75 126 L28 139 C18 142 19 153 30 154 L80 145 L112 130 L111 215 L94 290 L91 399 C90 414 105 419 109 403 L126 303 L150 230 L174 303 L191 403 C195 419 210 414 209 399 L206 290 L189 215 L188 130 L220 145 L270 154 C281 153 282 142 272 139 L225 126 L184 105 C168 98 163 94 163 80"
        fill="currentColor"
        fillOpacity="0.06"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="9 7"
      />
      <path
        d="M137 92 C144 98 156 98 163 92 M112 214 C133 226 167 226 188 214"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.78"
      />
    </svg>
  );
}

export function BodyScanCamera({ consentGranted, onCapture }: BodyScanCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestSequenceRef = useRef(0);
  const mountedRef = useRef(false);
  const countdownTimerRef = useRef<number | null>(null);
  const countdownValueRef = useRef<number | null>(null);

  const [status, setStatus] = useState<CameraStatus>('requesting');
  const [facingMode, setFacingMode] = useState<CameraFacingMode>('user');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  const clearCountdown = useCallback((updateState = true) => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    countdownValueRef.current = null;
    if (updateState) setCountdown(null);
  }, []);

  const stopCurrentStream = useCallback((updateState = true) => {
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (updateState) setVideoReady(false);
  }, []);

  const openCamera = useCallback(async (
    requestedFacingMode: CameraFacingMode,
    requireFacingMode = false
  ): Promise<boolean> => {
    const requestId = ++requestSequenceRef.current;
    clearCountdown();
    stopCurrentStream();
    setStatus('requesting');
    setMessage(null);

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      if (mountedRef.current && requestId === requestSequenceRef.current) {
        setStatus('unsupported');
        setMessage('دسترسی مستقیم دوربین فقط روی HTTPS یا localhost پشتیبانی می‌شود. از آپلود عکس استفاده کنید.');
      }
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: requireFacingMode
            ? { exact: requestedFacingMode }
            : { ideal: requestedFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 1920 },
        },
      });

      if (!mountedRef.current || requestId !== requestSequenceRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return false;
      }

      video.srcObject = stream;
      await video.play();

      if (!mountedRef.current || requestId !== requestSequenceRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      const actualFacingMode = stream.getVideoTracks()[0]?.getSettings().facingMode;
      setFacingMode(
        actualFacingMode === 'user' || actualFacingMode === 'environment'
          ? actualFacingMode
          : requestedFacingMode
      );
      setStatus('active');

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (mountedRef.current && requestId === requestSequenceRef.current) {
          setHasMultipleCameras(devices.filter((device) => device.kind === 'videoinput').length > 1);
        }
      } catch {
        if (mountedRef.current && requestId === requestSequenceRef.current) {
          setHasMultipleCameras(null);
        }
      }

      return true;
    } catch (error) {
      if (!mountedRef.current || requestId !== requestSequenceRef.current) return false;
      stopCurrentStream();
      const cameraError = cameraErrorStatus(error);
      setStatus(cameraError.status);
      setMessage(cameraError.message);
      return false;
    }
  }, [clearCountdown, stopCurrentStream]);

  const captureNow = useCallback(() => {
    const video = videoRef.current;
    if (!video || status !== 'active') return;

    try {
      const imageDataUrl = captureBodyScanFrame(video);
      stopCurrentStream();
      onCapture(imageDataUrl);
    } catch (error) {
      setMessage(
        error instanceof BodyScanImageError
          ? error.message
          : 'ثبت تصویر انجام نشد. دوباره تلاش کنید یا عکس آپلود کنید.'
      );
    }
  }, [onCapture, status, stopCurrentStream]);

  const startCountdown = () => {
    if (!consentGranted || status !== 'active' || !videoReady || countdownTimerRef.current !== null) {
      if (!consentGranted) {
        setMessage('ابتدا رضایت تحلیل تصویر را تأیید کنید.');
      }
      return;
    }

    setMessage(null);
    countdownValueRef.current = 5;
    setCountdown(5);
    countdownTimerRef.current = window.setInterval(() => {
      const nextValue = (countdownValueRef.current ?? 1) - 1;
      countdownValueRef.current = nextValue;

      if (nextValue > 0) {
        setCountdown(nextValue);
        return;
      }

      clearCountdown();
      captureNow();
    }, 1000);
  };

  const switchCamera = async () => {
    if (status !== 'active' || isSwitching || hasMultipleCameras === false) return;

    const previousMode = facingMode;
    const nextMode: CameraFacingMode = previousMode === 'user' ? 'environment' : 'user';
    setIsSwitching(true);
    const switched = await openCamera(nextMode, true);

    if (!switched && mountedRef.current) {
      const restored = await openCamera(previousMode);
      if (restored && mountedRef.current) {
        setMessage('تعویض دوربین روی این دستگاه انجام نشد؛ دوربین قبلی دوباره فعال شد.');
      }
    }

    if (mountedRef.current) setIsSwitching(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    // Scheduling avoids duplicate permission work caused by React StrictMode's
    // development-only setup/cleanup probe.
    const requestTimer = window.setTimeout(() => {
      void openCamera('user');
    }, 0);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      requestSequenceRef.current += 1;
      clearCountdown();
      stopCurrentStream();
      if (mountedRef.current) {
        setStatus('paused');
        setMessage('برای حفظ حریم خصوصی، دوربین با خروج از صفحه خاموش شد.');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(requestTimer);
      requestSequenceRef.current += 1;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearCountdown(false);
      stopCurrentStream(false);
    };
  }, [clearCountdown, openCamera, stopCurrentStream]);

  const cameraUnavailable = !['requesting', 'active'].includes(status);
  const canCapture = consentGranted && status === 'active' && videoReady && countdown === null;

  return (
    <div className="space-y-2">
      <div className="relative aspect-[3/4] min-h-[390px] overflow-hidden rounded-3xl bg-neutral-900 shadow-inner">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onLoadedMetadata={() => setVideoReady(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-transform duration-200 ${
            facingMode === 'user' ? '-scale-x-100' : ''
          }`}
          aria-label={facingMode === 'user' ? 'پیش‌نمایش دوربین جلو' : 'پیش‌نمایش دوربین عقب'}
        />

        {status === 'active' && (
          <>
            <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/20 via-transparent to-black/45" />
            <BodyPoseGuide />

            <button
              type="button"
              onClick={() => void switchCamera()}
              disabled={isSwitching || hasMultipleCameras === false}
              className="absolute right-3 top-3 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="تعویض دوربین جلو و عقب"
            >
              {isSwitching ? <Loader2 size={22} className="animate-spin" /> : <SwitchCamera size={23} />}
            </button>

            <span className="absolute left-3 top-4 z-20 rounded-xl bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
              {facingMode === 'user' ? 'دوربین جلو' : 'دوربین عقب'}
            </span>

            <div className="absolute bottom-[4.7rem] left-1/2 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl bg-black/60 px-3 py-2 text-center text-xs font-medium text-white backdrop-blur-sm">
              ۲ تا ۳ متر فاصله بگیرید و دست‌ها را باز کنید
            </div>

            {countdown !== null && (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center bg-black/15 text-7xl font-bold text-white drop-shadow-lg"
                aria-live="assertive"
              >
                {toPersianDigits(countdown)}
              </div>
            )}

            <button
              type="button"
              onClick={startCountdown}
              disabled={!canCapture}
              className="absolute bottom-3 left-1/2 z-40 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white bg-white/25 shadow-lg transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="گرفتن عکس با تایمر پنج ثانیه"
            >
              <span className="h-11 w-11 rounded-full bg-white" aria-hidden="true" />
            </button>
          </>
        )}

        {status === 'requesting' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-neutral-900 px-6 text-center text-white">
            <Loader2 size={36} className="animate-spin text-primary-400" />
            <p className="font-semibold">در انتظار اجازه دوربین…</p>
            <p className="text-sm text-neutral-300">در پیام مرورگر، گزینه Allow را انتخاب کنید.</p>
          </div>
        )}

        {cameraUnavailable && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-neutral-900 px-7 text-center text-white">
            {status === 'paused' ? (
              <Camera size={38} className="text-primary-400" />
            ) : (
              <AlertCircle size={38} className="text-amber-400" />
            )}
            <p className="text-sm leading-relaxed text-neutral-200">{message}</p>
            <button
              type="button"
              onClick={() => void openCamera(facingMode)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
            >
              <RefreshCw size={17} />
              فعال‌کردن دوباره دوربین
            </button>
          </div>
        )}

        {status === 'active' && !videoReady && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-neutral-900/75 text-white">
            <Loader2 size={30} className="animate-spin" />
          </div>
        )}
      </div>

      <p className="min-h-5 text-center text-xs text-neutral-500 dark:text-neutral-400" aria-live="polite">
        {message ?? (
          consentGranted
            ? 'دکمه عکس را بزنید؛ ثبت تصویر با تایمر ۵ ثانیه انجام می‌شود.'
            : 'برای فعال‌شدن دکمه عکس، رضایت تحلیل تصویر را تأیید کنید.'
        )}
      </p>

      <p className="sr-only" aria-live="polite">
        {countdown === null ? '' : `${toPersianDigits(countdown)} ثانیه تا ثبت عکس`}
      </p>
      {status === 'active' && videoReady && consentGranted && countdown === null && (
        <span className="sr-only">دوربین آماده ثبت تصویر است.</span>
      )}
    </div>
  );
}
