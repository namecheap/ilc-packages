import { render, waitFor } from '@testing-library/react';

import ilcAdapterReact, { SingleSpaContext } from './ilc-adapter-react';
import Parcel, { type ParcelProps } from './parcel';

import type { LifeCycles, ParcelLifecycleFnProps, ParcelObject } from 'ilc-sdk/app';

describe(`<Parcel />`, () => {
    let config: LifeCycles<ParcelLifecycleFnProps>, parcel: ParcelObject, props: ParcelProps;
    const mountParcel = vi.fn();

    beforeEach(() => {
        config = {
            bootstrap: vi.fn(async () => null),
            mount: vi.fn(async () => null),
            unmount: vi.fn(async () => null),
        };

        parcel = {
            mount: vi.fn(),
            loadPromise: Promise.resolve(null),
            bootstrapPromise: Promise.resolve(null),
            mountPromise: Promise.resolve(null),
            unmountPromise: Promise.resolve(null),
            getStatus: vi.fn(),
            unmount: vi.fn(),
            update: vi.fn(),
        };

        mountParcel.mockReset();
        mountParcel.mockReturnValue(parcel);

        props = { mountParcel, loadingFn: () => Promise.resolve(config) };
    });

    it(`renders a div by default`, () => {
        expect(document.querySelector('div')).not.toBeInTheDocument();
        render(<Parcel {...props} />);
        expect(document.querySelector('div')).toBeInTheDocument();
    });

    it(`renders a div wrap with style`, () => {
        render(<Parcel {...props} wrapStyle={{ height: '100px' }} />);
        expect(document.querySelector<HTMLElement>(`div[style]`)?.style.height).toEqual('100px');
    });

    it(`renders a div wrap with className`, () => {
        render(<Parcel {...props} wrapClassName="wrapper" />);
        expect(document.querySelector('div.wrapper')).toBeInTheDocument();
    });

    it(`calls the mountParcel prop when it mounts`, async () => {
        render(<Parcel {...props} />);
        await waitFor(() => expect(mountParcel).toHaveBeenCalled());
    });

    it(`renders inside the append to`, async () => {
        const appendTo = document.body.appendChild(document.createElement('section'));
        expect(document.querySelector('section div')).not.toBeInTheDocument();
        render(<Parcel {...props} appendTo={appendTo} />);
        await waitFor(() => expect(document.querySelector('section div')).toBeInTheDocument());
    });

    it(`calls parcelDidMount prop when the parcel finishes mounting`, async () => {
        const parcelDidMount = vi.fn();
        render(<Parcel {...props} parcelDidMount={parcelDidMount} />);

        expect(parcelDidMount).not.toHaveBeenCalled();

        await waitFor(() => expect(parcelDidMount).toHaveBeenCalled());
    });

    it(`doesn't update the parcel a second or third time until previous parcel updates complete`, async () => {
        const wrapper = render(<Parcel {...props} />);

        let numParcelUpdateCalls = 0;
        let firstParcelUpdateFinished = false;
        let secondParcelUpdateFinished = false;

        const thirdUpdateDone = new Promise<void>((resolve, reject) => {
            vi.mocked(parcel.update!).mockImplementation(() => {
                switch (++numParcelUpdateCalls) {
                    case 1:
                        return firstParcelUpdate();
                    case 2:
                        return secondParcelUpdate();
                    case 3:
                        return thirdParcelUpdate();
                    default:
                        reject(new Error('Parcel update should only be called thrice'));
                        return Promise.resolve(null);
                }
            });

            function firstParcelUpdate() {
                return new Promise<null>((resolveUpdate) => {
                    /* Don't resolve this promise for a while to make sure that the second update
                     * Doesn't start until the first finishes
                     */
                    setTimeout(() => {
                        firstParcelUpdateFinished = true;
                        resolveUpdate(null);
                    }, 100);
                });
            }

            function secondParcelUpdate() {
                return new Promise<null>((resolveUpdate) => {
                    setTimeout(() => {
                        expect(firstParcelUpdateFinished).toBe(true);
                        secondParcelUpdateFinished = true;
                        resolveUpdate(null);
                    }, 100);
                });
            }

            function thirdParcelUpdate() {
                return Promise.resolve().then(() => {
                    expect(firstParcelUpdateFinished).toBe(true);
                    expect(secondParcelUpdateFinished).toBe(true);
                    resolve();
                    return null;
                });
            }
        });

        function triggerComponentDidUpdate() {
            wrapper.rerender(<Parcel {...props} />);
        }

        // not once
        triggerComponentDidUpdate();

        // not twice
        triggerComponentDidUpdate();

        // but thrice!
        triggerComponentDidUpdate();

        await thirdUpdateDone;
    });

    it(`calls mountParcel with all the React props`, async () => {
        render(<Parcel {...props} />);
        // We need to wait for a microtask to finish before the Parcel component will have called mountParcel
        await waitFor(() => expect(mountParcel).toHaveBeenCalled());
        const parcelProps = mountParcel.mock.calls[0]![1];
        expect(parcelProps.domElement).toBeInstanceOf(HTMLDivElement);
    });

    it(`lets you not pass in a mountParcel prop if the SingleSpaContext is set with one`, async () => {
        // this creates the SingleSpaContext
        ilcAdapterReact({
            rootComponent() {
                return null;
            },
        });

        render(
            <SingleSpaContext.Provider value={{ mountParcel }}>
                <Parcel loadingFn={() => Promise.resolve(config)} />
            </SingleSpaContext.Provider>,
        );

        await waitFor(() => expect(mountParcel).toHaveBeenCalled());
    });
});
