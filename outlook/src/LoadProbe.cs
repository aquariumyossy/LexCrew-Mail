using System;
using System.Runtime.InteropServices;

[ComImport, Guid("B65AD801-ABAF-11D0-BB8B-00A0C90F2744"), InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
public interface IDTDispatch
{
    [DispId(1)]
    void OnConnection(object application, int connectMode, object addInInst, ref Array custom);
}

[ComImport, Guid("B65AD801-ABAF-11D0-BB8B-00A0C90F2744"), InterfaceType(ComInterfaceType.InterfaceIsDual)]
public interface IDTDual
{
    [DispId(1)]
    void OnConnection(object application, int connectMode, object addInInst, [MarshalAs(UnmanagedType.SafeArray, SafeArraySubType = VarEnum.VT_VARIANT)] ref Array custom);
}

class Program
{
    static void Main()
    {
        object o = Activator.CreateInstance(Type.GetTypeFromProgID("Kuru.Connect", true));
        IntPtr unk = Marshal.GetIUnknownForObject(o);
        Guid g = new Guid("B65AD801-ABAF-11D0-BB8B-00A0C90F2744");
        IntPtr face;
        int hr = Marshal.QueryInterface(unk, ref g, out face);
        Console.WriteLine("QI hr=0x" + hr.ToString("X8") + " ptr=" + face);
        if (face != IntPtr.Zero) Marshal.Release(face);
        Marshal.Release(unk);

        object rcw = Marshal.GetObjectForIUnknown(Marshal.GetIUnknownForObject(o));
        Console.WriteLine("rcw " + rcw.GetType().FullName);
        try
        {
            Array custom = Array.CreateInstance(typeof(object), 0);
            ((IDTDispatch)rcw).OnConnection(null, 1, rcw, ref custom);
            Console.WriteLine("idispatch invoke ok");
        }
        catch (Exception ex)
        {
            Console.WriteLine("idispatch FAIL " + ex.GetType().Name + ": " + ex.Message);
        }
    }
}
