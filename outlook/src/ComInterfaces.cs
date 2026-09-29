using System;
using System.Runtime.InteropServices;

namespace KuruOutlook
{
    public enum ext_ConnectMode { ext_cm_AfterStartup = 0, ext_cm_Startup = 1, ext_cm_External = 2, ext_cm_CommandLine = 3, ext_cm_Solution = 4, ext_cm_UISetup = 5 }
    public enum ext_DisconnectMode { ext_dm_HostShutdown = 0, ext_dm_UserClosed = 1 }

    [ComImport, Guid("B65AD801-ABAF-11D0-BB8B-00A0C90F2744"), InterfaceType(ComInterfaceType.InterfaceIsDual)]
    public interface IDTExtensibility2
    {
        [DispId(1)]
        void OnConnection([MarshalAs(UnmanagedType.IDispatch)] object application, ext_ConnectMode connectMode, [MarshalAs(UnmanagedType.IDispatch)] object addInInst, [MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_VARIANT)] ref Array custom);
        [DispId(2)]
        void OnDisconnection(ext_DisconnectMode removeMode, [MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_VARIANT)] ref Array custom);
        [DispId(3)]
        void OnAddInsUpdate([MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_VARIANT)] ref Array custom);
        [DispId(4)]
        void OnStartupComplete([MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_VARIANT)] ref Array custom);
        [DispId(5)]
        void OnBeginShutdown([MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_VARIANT)] ref Array custom);
    }

    [ComImport, Guid("000C0396-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsDual)]
    public interface IRibbonExtensibility
    {
        [DispId(1)]
        string GetCustomUI(string ribbonId);
    }

    [ComImport, Guid("000C0395-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsDual)]
    public interface IRibbonControl
    {
        [DispId(1)]
        string Id { [return: MarshalAs(UnmanagedType.BStr)] get; }
        [DispId(2)]
        object Context { [return: MarshalAs(UnmanagedType.IDispatch)] get; }
    }

    [ComVisible(true)]
    [Guid("C3D5E4F6-7081-4C8D-9E1F-2A3B4C5D6E7F")]
    [InterfaceType(ComInterfaceType.InterfaceIsDual)]
    public interface IKuruRibbon
    {
        [DispId(1)]
        void OnKuruClick([MarshalAs(UnmanagedType.IDispatch)] object control);
    }

    [ComImport, Guid("000C033E-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsDual)]
    public interface ICustomTaskPaneConsumer
    {
        [DispId(1)]
        void CTPFactoryAvailable([MarshalAs(UnmanagedType.IDispatch)] object factory);
    }

    [ComImport, Guid("000C033D-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
    public interface ICTPFactory
    {
        [DispId(1)]
        [return: MarshalAs(UnmanagedType.IDispatch)]
        object CreateCTP(string ctpAxId, string ctpTitle, [MarshalAs(UnmanagedType.Struct)] object ctpParentWindow);
    }
}
