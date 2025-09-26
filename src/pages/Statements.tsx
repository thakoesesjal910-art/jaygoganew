import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Download, Filter, DollarSign, PiggyBank, ChevronDown, ChevronUp } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Transaction {
  date: string;
  type: 'order' | 'payment';
  description: string;
  billed: number;
  paid: number;
  customerName: string;
}

export function Statements() {
  const { customers, getFilteredOrders, getFilteredPayments } = useData();
  const [filters, setFilters] = useState({
    customer: '',
    dateFrom: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    dateTo: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    period: 'month'
  });
  const [openCustomers, setOpenCustomers] = useState<Record<string, boolean>>({});

  const customerStatements = useMemo(() => {
    const filterParams = {
      customer: filters.customer || undefined,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo
    };
    const filteredOrders = getFilteredOrders(filterParams);
    const filteredPayments = getFilteredPayments(filterParams);

    const statements: Record<string, {
      customerName: string;
      transactions: Transaction[];
      totalBilled: number;
      totalPaid: number;
    }> = {};

    for (const order of filteredOrders) {
      if (!statements[order.customerId]) {
        statements[order.customerId] = {
          customerName: order.customerName,
          transactions: [],
          totalBilled: 0,
          totalPaid: 0,
        };
      }
      statements[order.customerId].transactions.push({
        date: order.orderDate,
        type: 'order',
        description: `Order: ${order.items.map(i => `${i.quantity}x ${i.productName}`).join(', ')}`,
        billed: order.totalAmount,
        paid: 0,
        customerName: order.customerName,
      });
      statements[order.customerId].totalBilled += order.totalAmount;
    }

    for (const payment of filteredPayments) {
      if (!statements[payment.customerId]) {
        statements[payment.customerId] = {
          customerName: payment.customerName,
          transactions: [],
          totalBilled: 0,
          totalPaid: 0,
        };
      }
      statements[payment.customerId].transactions.push({
        date: payment.paymentDate,
        type: 'payment',
        description: `Payment received`,
        billed: 0,
        paid: payment.amount,
        customerName: payment.customerName,
      });
      statements[payment.customerId].totalPaid += payment.amount;
    }

    Object.values(statements).forEach(statement => {
      statement.transactions.sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
    });
    
    return Object.entries(statements)
      .map(([customerId, data]) => ({ customerId, ...data }))
      .sort((a, b) => a.customerName.localeCompare(b.customerName));

  }, [filters, getFilteredOrders, getFilteredPayments]);

  const totalBilled = customerStatements.reduce((sum, s) => sum + s.totalBilled, 0);
  const totalPaid = customerStatements.reduce((sum, s) => sum + s.totalPaid, 0);

  const toggleCustomer = (customerId: string) => {
    setOpenCustomers(prev => ({ ...prev, [customerId]: !prev[customerId] }));
  };

  const handlePeriodChange = (period: string) => {
    const today = new Date();
    let dateFrom = '';
    let dateTo = format(today, 'yyyy-MM-dd');

    switch (period) {
      case 'today':
        dateFrom = format(today, 'yyyy-MM-dd');
        break;
      case 'week':
        dateFrom = format(startOfWeek(today), 'yyyy-MM-dd');
        dateTo = format(endOfWeek(today), 'yyyy-MM-dd');
        break;
      case 'month':
        dateFrom = format(startOfMonth(today), 'yyyy-MM-dd');
        dateTo = format(endOfMonth(today), 'yyyy-MM-dd');
        break;
      default:
        dateFrom = filters.dateFrom;
        dateTo = filters.dateTo;
        break;
    }
    setFilters({ ...filters, period, dateFrom, dateTo });
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Jay Goga Milk Supplier', 20, 20);
    doc.setFontSize(14);
    doc.text('Account Statement', 20, 30);
    doc.setFontSize(10);
    doc.text(`Period: ${format(parseISO(filters.dateFrom), 'MMM dd, yyyy')} to ${format(parseISO(filters.dateTo), 'MMM dd, yyyy')}`, 20, 40);

    let startY = 50;
    
    if (filters.customer && customerStatements.length > 0) {
        doc.text(`Customer: ${customerStatements[0].customerName}`, 20, startY);
        startY += 10;
    }

    customerStatements.forEach((statement, index) => {
        if(index > 0) startY += 10;
        
        if (!filters.customer) {
            doc.setFontSize(12);
            doc.text(statement.customerName, 20, startY);
            startY += 8;
        }

        const head = [['Date', 'Description', 'Billed', 'Paid']];
        const tableData = statement.transactions.map(tx => [
            format(parseISO(tx.date), 'dd/MM/yyyy'),
            tx.description,
            tx.billed > 0 ? `₹${tx.billed.toFixed(2)}` : '-',
            tx.paid > 0 ? `₹${tx.paid.toFixed(2)}` : '-',
        ]);

        autoTable(doc, {
            head: head,
            body: tableData,
            startY: startY,
            styles: { fontSize: 9 },
            headStyles: { fillColor: [14, 165, 233] },
            columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } }
        });

        startY = (doc as any).lastAutoTable.finalY + 5;
        doc.setFontSize(10);
        doc.text(`Subtotal: Billed ₹${statement.totalBilled.toFixed(2)}, Paid ₹${statement.totalPaid.toFixed(2)}, Pending ₹${(statement.totalBilled - statement.totalPaid).toFixed(2)}`, 20, startY);
        startY += 10;
    });

    startY += 5;
    doc.setLineWidth(0.5);
    doc.line(20, startY, 190, startY);
    startY += 10;
    
    doc.setFontSize(12);
    doc.text(`Grand Total Billed: ₹${totalBilled.toFixed(2)}`, 20, startY);
    doc.text(`Grand Total Paid: ₹${totalPaid.toFixed(2)}`, 20, startY + 8);
    doc.setFontSize(14);
    doc.text(`Overall Pending Amount: ₹${(totalBilled - totalPaid).toFixed(2)}`, 20, startY + 20);

    doc.save(`account-statement-${filters.dateFrom}-to-${filters.dateTo}.pdf`);
  };

  const exportToCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    customerStatements.forEach(statement => {
        csvContent += `"${statement.customerName}"\n`;
        csvContent += "Date,Description,Billed,Paid\n";
        statement.transactions.forEach(tx => {
            const row = [
                format(parseISO(tx.date), 'yyyy-MM-dd'),
                tx.description,
                tx.billed.toFixed(2),
                tx.paid.toFixed(2)
            ].join(',');
            csvContent += row + "\n";
        });
        csvContent += `\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `account-statement-${filters.dateFrom}-to-${filters.dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Account Statements</h1>
          <p className="text-gray-600">View and download customer account history</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportToCSV}
            className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-green-700 transition-colors duration-200"
          >
            <Download className="w-5 h-5" />
            Excel
          </button>
          <button
            onClick={generatePDF}
            className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-red-700 transition-colors duration-200"
          >
            <Download className="w-5 h-5" />
            PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-soft p-6 mb-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quick Period</label>
            <div className="flex gap-2">
              {['today', 'week', 'month'].map(p => (
                <button
                  key={p}
                  onClick={() => handlePeriodChange(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                    filters.period === p ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >{p.charAt(0).toUpperCase() + p.slice(1)}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value, period: 'custom' })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value, period: 'custom' })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>
            <select value={filters.customer} onChange={(e) => setFilters({ ...filters, customer: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
              <option value="">All Customers</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl shadow-soft p-6 flex items-center gap-4">
          <DollarSign className="w-8 h-8 text-blue-600" />
          <div><p className="text-sm text-gray-600">Total Billed</p><p className="text-2xl font-bold text-gray-900">₹{totalBilled.toFixed(2)}</p></div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl shadow-soft p-6 flex items-center gap-4">
          <PiggyBank className="w-8 h-8 text-green-600" />
          <div><p className="text-sm text-gray-600">Total Received</p><p className="text-2xl font-bold text-gray-900">₹{totalPaid.toFixed(2)}</p></div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-2xl shadow-soft p-6 flex items-center gap-4">
          <FileText className="w-8 h-8 text-red-600" />
          <div><p className="text-sm text-gray-600">Total Pending</p><p className="text-2xl font-bold text-gray-900">₹{(totalBilled - totalPaid).toFixed(2)}</p></div>
        </motion.div>
      </div>

      {/* Customer Statements */}
      <div className="space-y-4">
        {customerStatements.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl shadow-soft">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions found</h3>
            <p className="text-gray-500">Try adjusting your filters to see results</p>
          </div>
        ) : (
          customerStatements.map(statement => (
            <motion.div layout key={statement.customerId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl shadow-soft overflow-hidden">
              <button onClick={() => toggleCustomer(statement.customerId)} className="w-full p-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors">
                <h3 className="text-lg font-semibold text-gray-900">{statement.customerName}</h3>
                <div className="flex items-center gap-4 md:gap-6">
                  <div className="text-right hidden md:block"><p className="text-xs text-blue-600">Billed</p><p className="font-semibold text-sm">₹{statement.totalBilled.toFixed(2)}</p></div>
                  <div className="text-right hidden md:block"><p className="text-xs text-green-600">Paid</p><p className="font-semibold text-sm">₹{statement.totalPaid.toFixed(2)}</p></div>
                  <div className="text-right"><p className="text-xs text-red-600">Pending</p><p className="font-semibold text-sm">₹{(statement.totalBilled - statement.totalPaid).toFixed(2)}</p></div>
                  {openCustomers[statement.customerId] ? <ChevronUp className="w-5 h-5 text-gray-600" /> : <ChevronDown className="w-5 h-5 text-gray-600" />}
                </div>
              </button>
              <AnimatePresence>
                {openCustomers[statement.customerId] && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="border-t border-gray-200">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Billed</th>
                              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {statement.transactions.map((tx, index) => (
                              <tr key={index}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{format(parseISO(tx.date), 'MMM dd, yyyy')}</td>
                                <td className="px-6 py-4 text-sm text-gray-900 max-w-sm">{tx.description}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600 text-right">{tx.billed > 0 ? `₹${tx.billed.toFixed(2)}` : '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600 text-right">{tx.paid > 0 ? `₹${tx.paid.toFixed(2)}` : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
