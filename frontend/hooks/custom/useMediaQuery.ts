import {
    useState, useEffect
} from 'react';

/**
 * Media query hook
 */
export const useMediaQuery = (query: string) => {
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
