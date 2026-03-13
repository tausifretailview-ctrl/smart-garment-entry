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

// Auto-reconnect to a previously paired printer without showing the picker dialog
export const autoReconnectUsbPrinter = async (): Promise<{ success: boolean; name: string }> => {
  if (!isWebUsbSupported()) return { success: false, name: '' };
  if (connectedDevice) return { success: true, name: connectedDevice.productName || 'USB Printer' };
  try {
    const devices = await navigator.usb.getDevices();
    // Find a printer class device (0x07)
    const printer = devices.find((d: any) =>
      d.configuration?.interfaces?.some((iface: any) =>
        iface.alternates?.some((alt: any) => alt.interfaceClass === 0x07)
      )
    );
    if (!printer) return { success: false, name: '' };
    await printer.open();
    if (printer.configuration === null) {
      await printer.selectConfiguration(1);
    }
    let interfaceNum = 0;
    let endpointNum = 1;
    for (const iface of printer.configuration.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass === 0x07) {
          interfaceNum = iface.interfaceNumber;
          for (const ep of alt.endpoints) {
            if (ep.direction === 'out') endpointNum = ep.endpointNumber;
          }
        }
      }
    }
    await printer.claimInterface(interfaceNum);
    connectedDevice = printer;
    transferEndpoint = endpointNum;
    const name = printer.productName || printer.manufacturerName || 'USB Printer';
    return { success: true, name };
  } catch {
    return { success: false, name: '' };
  }
};

export const connectUsbPrinter = async (): Promise<{ success: boolean; name: string; error?: string }> => {
  if (!isWebUsbSupported()) {
    return { success: false, name: '', error: 'WebUSB not supported. Use Chrome or Edge browser.' };
  }
  // Try auto-reconnect first (no picker needed)
  const auto = await autoReconnectUsbPrinter();
  if (auto.success) return { success: true, name: auto.name };
  
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
    if (err?.message?.includes('Access denied') || err?.message?.includes('access')) {
      return { 
        success: false, 
        name: '', 
        error: 'Access denied — Windows printer driver is blocking USB access. Open Device Manager → find your printer → Uninstall the driver (check "Delete driver software") → unplug & replug the printer → try again. Or use Zadig tool to replace the driver with WinUSB.' 
      };
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
