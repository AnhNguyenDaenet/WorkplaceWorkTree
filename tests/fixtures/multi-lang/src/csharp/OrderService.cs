using Contoso.Core;

namespace Contoso.Orders
{
    public class OrderService : ServiceBase, IOrderService
    {
        public void Process()
        {
            Validator.Check();
        }
    }
}
