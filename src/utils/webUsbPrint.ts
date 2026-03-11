// WebUSB Direct Thermal Printer Utility
// Sends raw TSPL commands directly to USB thermal printer (TSC, Godex, Xprinter, HPRT)
// No Java, no QZ Tray, no drivers needed — works in Chrome and Edge only

declare global {
  interface Navigator { usb: any; }
}

let connectedDevice: any = null;
let transferEndpoint: number = 1;

export const isWebUsbSupported = (): boolean => {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
};

export const getConnectedUsbPrinter = () => connectedDevice;

export const connectUsbPrinter = async (): Promise<{ success: boolean; name: string; error?: string }> => {
  if (!isWebUsbSupported()) {
    return { success: false, name: '', error: 'WebUSB not supported. Use Chrome or Edge browser.' };
  }
  try {
    const device = await navigator.usb.requestDevice({ filters: [{ classCode: 0x07 }] });
    await device.open();
    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }
    let interfaceNum = 0;
    let endpointNum = 1;
    for (const iface of device.configuration.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass === 0x07) {
          interfaceNum = iface.interfaceNumber;
          for (const ep of alt.endpoints) {
            if (ep.direction === 'out') endpointNum = ep.endpointNumber;
          }
        }
      }
    }
    await device.claimInterface(interfaceNum);
    connectedDevice = device;
    transferEndpoint = endpointNum;
    const name = device.productName || device.manufacturerName || 'USB Printer';
    return { success: true, name };
  } catch (err: any) {
    if (err?.name === 'NotFoundError') {
      return { success: false, name: '', error: 'No printer selected. Please choose your printer and try again.' };
    }
    return { success: false, name: '', error: err?.message || 'Failed to connect to printer' };
  }
};

export const disconnectUsbPrinter = async (): Promise<void> => {
  if (!connectedDevice) return;
  try {
    await connectedDevice.releaseInterface(0);
    await connectedDevice.close();
  } catch { /* ignore */ }
  connectedDevice = null;
};

export const printViaWebUsb = async (tsplCommands: string): Promise<{ success: boolean; error?: string }> => {
  if (!connectedDevice) {
    return { success: false, error: 'No printer connected. Click "Connect USB Printer" first.' };
  }
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(tsplCommands);
    const chunkSize = 4096;
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.slice(offset, offset + chunkSize);
      const result = await connectedDevice.transferOut(transferEndpoint, chunk);
      if (result.status !== 'ok') {
        return { success: false, error: `Transfer failed at offset ${offset}: ${result.status}` };
      }
    }
    return { success: true };
  } catch (err: any) {
    if (err?.message?.includes('LIBUSB') || err?.message?.includes('disconnected')) {
      connectedDevice = null;
      return { success: false, error: 'Printer disconnected. Please reconnect and try again.' };
    }
    return { success: false, error: err?.message || 'Print failed' };
  }
};
