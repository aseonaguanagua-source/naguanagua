'use client';

import dynamic from 'next/dynamic';

const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false });

export default function MapWrapper(props: any) {
  return <MapPicker {...props} />;
}
