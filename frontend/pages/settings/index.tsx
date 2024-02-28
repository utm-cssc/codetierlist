import axios, { handleError } from '@/axios';
import { ControlCard, defaultAccentColor, getThemes } from '@/components';
import { SnackbarContext } from '@/contexts/SnackbarContext';
import { UserContext } from '@/contexts/UserContext';
import favicon from '@/public/favicon.svg';
import {
    Caption1,
    Dropdown,
    Option,
    Subtitle2,
    Title3,
    Link,
} from '@fluentui/react-components';
import { Color24Regular, Image24Regular, PaintBrush24Regular } from '@fluentui/react-icons';
import { Theme } from 'codetierlist-types';
import Head from 'next/head';
import Image from 'next/image';
import { useContext, useState, useEffect } from 'react';
import { Container } from 'react-grid-system';
import pkg from '../../package.json';
import useLocalStorage from 'use-local-storage';
import styles from './settings.module.css';

const toSentenceCase = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const ThemeSelector = () => {
    const { userInfo, fetchUserInfo } = useContext(UserContext);
    const { showSnackSev } = useContext(SnackbarContext);

    /**
     * Change the user's theme.
     * @param theme the theme to change to
     */
    const changeTheme = (theme: Theme) => {
        axios
            .post('/users/theme', {
                theme,
            })
            .catch((e) => {
                handleError(showSnackSev)(e);
            })
            .finally(() => {
                fetchUserInfo();
            });
    };

    return (
        <Dropdown value={toSentenceCase(userInfo.theme)} appearance="filled-darker">
            {[
                'SYSTEM',
                ...Object.keys(getThemes(userInfo.accent_color || defaultAccentColor)),
            ].map((theme) => (
                <Option
                    key={theme}
                    value={theme}
                    onClick={() => changeTheme(theme as Theme)}
                >
                    {toSentenceCase(theme)}
                </Option>
            ))}
        </Dropdown>
    );
};

declare interface Background {
    name: string;
    url: string | undefined;
}

const backgrounds = [
    {
        name: 'Default',
        url: undefined,
    },
    {
        name: 'Solid color',
        url: 'unset',
    },
    {
        name: 'UTM Deer 1',
        url: 'url("https://i.imgur.com/WsYfjnZ.jpeg")',
    },
    {
        name: 'UTM Deer 2',
        url: 'url("https://i.imgur.com/YccJwOS.jpg")',
    },
    {
        name: 'Daksh',
        url: 'url("https://avatars.githubusercontent.com/u/47948188")',
    },
    {
        name: 'Glow',
        url: 'url("https://logonoff.co/assets/FirstLogonAnim.svg")',
    },
];

const BackgroundSelector = () => {
    const [background, setBackground] = useLocalStorage<string | undefined>(
        'background',
        undefined
    );

    // avoid hydration mismatch
    const [dropdownValue, setDropdownValue] = useState<string>('');

    useEffect(() => {
        const value = backgrounds.find((bg) => bg.url === background)?.name;

        if (value) {
            setDropdownValue(value);
        }
    }, [background]);

    return (
        <Dropdown value={dropdownValue} appearance="filled-darker">
            {backgrounds.map((bg: Background) => (
                <Option
                    key={bg.name}
                    value={bg.url}
                    onClick={() => setBackground(bg.url)}
                >
                    {bg.name}
                </Option>
            ))}
        </Dropdown>
    );
};

const AccentSelector = () => {
    const { userInfo, setUserInfo, fetchUserInfo } = useContext(UserContext);
    const { showSnackSev } = useContext(SnackbarContext);
    const [accentColor, setAccentColor] = useState(
        userInfo.accent_color || defaultAccentColor
    );
    const [accentTimeout, setAccentTimeout] = useState<NodeJS.Timeout | undefined>(
        undefined
    );
    const [lastResolvedAccent, setLastResolvedAccent] = useState(0);

    return (
        <input
            type={'color'}
            value={accentColor}
            onChange={(e) => {
                setAccentColor(e.target.value);
                if (accentTimeout && lastResolvedAccent < Date.now() - 10) {
                    clearTimeout(accentTimeout);
                }
                setAccentTimeout(
                    setTimeout(() => {
                        setLastResolvedAccent(Date.now());
                        setUserInfo({ ...userInfo, accent_color: e.target.value });
                    }, 10)
                );
            }}
            onBlur={(e) => {
                // save the accent color
                axios
                    .post('/users/accent', { accent_color: e.target.value })
                    .then(async () => {
                        await fetchUserInfo();
                        showSnackSev('Accent color updated', 'success');
                    })
                    .catch((err) => {
                        handleError(showSnackSev)(err);
                    });
            }}
        />
    );
};
export const Settings = () => {
    return (
        <>
            <Head>
                <title>Settings - Codetierlist</title>
            </Head>
            <Container component="main" className="m-t-xxxl">
                <Title3 block className="m-b-xl">
                    Settings
                </Title3>
                <Subtitle2 className="m-t-xl">Appearance</Subtitle2>
                <form className={`m-t-l m-b-xxxl ${styles.form}`}>
                    <ControlCard
                        title="Theme"
                        description="Select which app theme to display"
                        icon={<PaintBrush24Regular />}
                    >
                        <ThemeSelector />
                    </ControlCard>

                    <ControlCard
                        title="Background image"
                        description="A picture background that will be displayed behind the app."
                        icon={<Image24Regular />}
                    >
                        <BackgroundSelector />
                    </ControlCard>

                    <ControlCard
                        title="Accent Colour"
                        description="Select the accent colour for the app"
                        icon={<Color24Regular />}
                    >
                        <AccentSelector />
                    </ControlCard>
                </form>

                <Subtitle2 className="m-t-xl">About</Subtitle2>
                <div className="m-t-l m-b-xxxl">
                    <ControlCard
                        title="Codetierlist"
                        description={
                            <Caption1>
                                &copy; 2024{' '}
                                <Link
                                    as="a"
                                    href="https://www.linkedin.com/in/idobenhaim/"
                                >
                                    Ido
                                </Link>
                                ,{' '}
                                <Link as="a" href="https://www.linkedin.com/in/leejacks/">
                                    Jackson
                                </Link>
                                ,{' '}
                                <Link
                                    as="a"
                                    href="https://www.linkedin.com/in/daksh-malhotra/"
                                >
                                    Daksh
                                </Link>
                                ,{' '}
                                <Link
                                    as="a"
                                    href="https://www.linkedin.com/in/yousef-bulbulia/"
                                >
                                    Yousef
                                </Link>
                                ,{' '}
                                <Link
                                    as="a"
                                    href="https://www.linkedin.com/in/brianzhang/"
                                >
                                    Brian
                                </Link>
                                .
                            </Caption1>
                        }
                        icon={
                            <Image
                                src={favicon}
                                alt="Codetierlist"
                                width={24}
                                height={24}
                            />
                        }
                    >
                        <>v{pkg.version}</>
                    </ControlCard>
                </div>
            </Container>
        </>
    );
};

export default Settings;
