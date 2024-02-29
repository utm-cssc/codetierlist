import { defaultAccentColor, getThemes, Navbar } from '@/components';
import '@/styles/globals.css';
import '@/styles/spacing.css';
import {
    createDOMRenderer,
    Field,
    FluentProvider,
    GriffelRenderer,
    ProgressBar,
    RendererProvider,
    SSRProvider,
    Toast,
    ToastBody,
    Toaster,
    ToastIntent,
    ToastTitle,
    useId,
    useToastController,
} from '@fluentui/react-components';
import type { AppProps } from 'next/app';
import { defaultUser, UserContext } from '@/contexts/UserContext';
import { FetchedUser, Theme } from 'codetierlist-types';
import { useEffect, useState, useMemo } from 'react';
import axios, { handleError } from '@/axios';
import { SnackbarContext } from '@/contexts/SnackbarContext';
import useLocalStorage from 'use-local-storage';

type EnhancedAppProps = AppProps & {
    renderer?: GriffelRenderer;
};

/**
 * Media query hook
 */
const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia(query);
        if (mediaQuery.matches !== matches) {
            setMatches(mediaQuery.matches);
        }

        const listener = () => setMatches(mediaQuery.matches);
        mediaQuery.addEventListener('change', listener);

        return () => mediaQuery.removeEventListener('change', listener);
    }, [matches, query]);

    return matches;
};

/**
 * Conditionally sets the theme based on the system theme
 */
export const useSystemTheme = (theme: Theme): Theme => {
    const darkQuery = useMediaQuery('(prefers-color-scheme: dark)');
    const contrastQuery = useMediaQuery('(prefers-contrast: more)');

    return useMemo(() => {
        // set scrollbar color
        if (typeof document !== 'undefined') {
            document.documentElement.style.colorScheme =
                theme === 'SYSTEM' ? (darkQuery ? 'dark' : 'light') : theme;
        }

        if (theme === 'SYSTEM') {
            return contrastQuery ? 'CONTRAST' : darkQuery ? 'DARK' : 'LIGHT';
        } else {
            return theme;
        }
    }, [darkQuery, contrastQuery, theme]);
};

/**
 * Fetches user info
 */
const useUserInfo = (
    showSnackSev: (message?: string, severity?: ToastIntent) => void
) => {
    const [userInfo, setUserInfo] = useState<FetchedUser>(defaultUser);

    const fetchUserInfo = async () => {
        await axios('/users')
            .then(({ data }) => {
                setUserInfo(data as FetchedUser);
            })
            .catch((e) => {
                handleError(showSnackSev)(e);
            });
    };

    useEffect(() => {
        void fetchUserInfo();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { userInfo, setUserInfo, fetchUserInfo };
};

function MyApp({ Component, pageProps, renderer }: EnhancedAppProps) {
    /** snackbar */
    const toasterId = useId('toaster');
    const { dispatchToast } = useToastController(toasterId);

    const showSnack = (message?: string, action?: JSX.Element, content?: JSX.Element) => {
        if (message) {
            dispatchToast(
                <Toast>
                    <ToastTitle>{message}</ToastTitle>
                </Toast>,
                { intent: 'info' }
            );
        } else {
            dispatchToast(content, { intent: 'info' });
        }
    };

    const showSnackSev = (message?: string, severity?: ToastIntent) =>
        dispatchToast(
            <Toast>
                <ToastTitle>{severity}</ToastTitle>
                <ToastBody>{message}</ToastBody>
            </Toast>,
            { intent: severity }
        );

    /** user info */
    const { userInfo, setUserInfo, fetchUserInfo } = useUserInfo(showSnackSev);

    /*
     * themes
     */
    const themes = useMemo(() => {
        return getThemes(userInfo.accent_color || defaultAccentColor);
    }, [userInfo.accent_color]);

    const theme = useSystemTheme(userInfo.theme);

    // custom background image
    const [background, _] = useLocalStorage('background', undefined);

    // avoid hydration mismatch
    const [backgroundProps, setBackgroundProps] = useState<React.CSSProperties>({});

    useEffect(() => {
        setBackgroundProps({
            '--background': background,
        } as React.CSSProperties);
    }, [background]);

    return (
        // 👇 Accepts a renderer from <Document /> or creates a default one
        //    Also triggers rehydration a client
        <RendererProvider renderer={renderer || createDOMRenderer()}>
            <SSRProvider>
                <UserContext.Provider value={{ userInfo, setUserInfo, fetchUserInfo }}>
                    <FluentProvider theme={themes[theme]} style={backgroundProps}>
                        <SnackbarContext.Provider value={{ showSnack, showSnackSev }}>
                            <Field validationState="none" id="axios-loading-backdrop">
                                <ProgressBar />
                            </Field>
                            <Navbar />
                            <Component {...pageProps} />
                            <Toaster toasterId={toasterId} />
                        </SnackbarContext.Provider>
                    </FluentProvider>
                </UserContext.Provider>
            </SSRProvider>
        </RendererProvider>
    );
}

export default MyApp;
